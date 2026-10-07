// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title LyraAutonomousAgent
/// @notice Intercambia USDC contra un libro de producto constante y se puede pausar.
/// @dev El USDC del libro está en el owner. La ganancia es lo que supera a Chainlink, no un 0,1 % fijo.
contract LyraAutonomousAgent {
    uint256 public constant PRICE_STALENESS = 3 hours;
    uint256 public constant MIN_EDGE_BPS = 50;
    uint256 public constant TRADE_BPS = 1000;
    uint256 private constant USDC_UNIT = 1_000_000;
    uint256 private constant WETH_UNIT = 1e18;

    struct Quote {
        bool sellingWeth;
        uint256 amountIn;
        uint256 amountOut;
        uint256 profit;
        uint256 fair;
    }

    address public immutable owner;
    address public immutable usdcToken;
    uint256 public immutable executionCooldown;
    uint8 public immutable feedDecimals;

    AggregatorV3Interface internal priceFeed;
    address public pauser;
    bool public paused;
    uint256 public lastExecutionTime;
    uint256 public reserveUsdc;
    uint256 public reserveWeth;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);
    event StrategyExecuted(uint256 timestamp, string action, uint256 profit);
    event Paused(address account);
    event Unpaused(address account);

    error NotOwner();
    error NotOperator();
    error EnforcedPause();
    error ExpectedPause();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdc_, address priceFeed_, address pauser_, uint256 cooldown_, uint256 inventoryWeth_) {
        if (usdc_ == address(0) || priceFeed_ == address(0) || cooldown_ == 0) revert NotOwner();
        owner = msg.sender;
        usdcToken = usdc_;
        priceFeed = AggregatorV3Interface(priceFeed_);
        pauser = pauser_;
        executionCooldown = cooldown_;
        uint8 decimals_ = priceFeed.decimals();
        require(decimals_ > 0 && decimals_ <= 18, "bad decimals");
        feedDecimals = decimals_;
        lastExecutionTime = block.timestamp;
        if (inventoryWeth_ > 0) {
            (, int256 answer, , , ) = priceFeed.latestRoundData();
            require(answer > 0, "bad price");
            uint256 fair = uint256(answer) * USDC_UNIT / (10 ** uint256(decimals_));
            reserveUsdc = (fair * 110) / 100;
            reserveWeth = WETH_UNIT;
            totalSupply = inventoryWeth_;
            balanceOf[address(this)] = inventoryWeth_;
            emit Transfer(address(0), address(this), inventoryWeth_);
        }
    }

    function wethToken() external view returns (address) {
        return address(this);
    }

    function setPauser(address next) external onlyOwner {
        pauser = next;
    }

    function setPool(uint256 usdcReserve, uint256 wethReserve) external onlyOwner {
        require(usdcReserve > 0 && wethReserve > 0, "zero amount");
        reserveUsdc = usdcReserve;
        reserveWeth = wethReserve;
    }

    function mintInventory(uint256 amount) external onlyOwner {
        require(amount > 0, "zero amount");
        totalSupply += amount;
        balanceOf[address(this)] += amount;
        emit Transfer(address(0), address(this), amount);
    }

    function pauseAgent() external {
        if (msg.sender != owner && (pauser == address(0) || msg.sender != pauser)) revert NotOperator();
        if (paused) revert EnforcedPause();
        paused = true;
        emit Paused(msg.sender);
    }

    function resumeAgent() external {
        if (msg.sender != owner && (pauser == address(0) || msg.sender != pauser)) revert NotOperator();
        if (!paused) revert ExpectedPause();
        paused = false;
        emit Unpaused(msg.sender);
    }

    function depositUSDC(uint256 amount) external onlyOwner {
        require(amount > 0, "zero amount");
        require(IERC20(usdcToken).transferFrom(msg.sender, address(this), amount), "transfer failed");
        emit Deposit(msg.sender, amount);
    }

    function getLatestPrice() public view returns (int256) {
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        return answer;
    }

    function priceIsFresh() external view returns (bool) {
        return _priceFresh();
    }

    function tradingEdge() external view returns (uint256) {
        return _quote().profit;
    }

    function executeStrategy() external {
        if (paused) revert EnforcedPause();
        require(block.timestamp >= lastExecutionTime + executionCooldown, "Cooldown active");
        int256 ethPrice = getLatestPrice();
        require(ethPrice > 0, "bad price");
        require(_priceFresh(), "stale price");

        uint256 usdcBalance = IERC20(usdcToken).balanceOf(address(this));
        require(usdcBalance > 0 || balanceOf[address(this)] > 0, "No funds to operate");

        Quote memory quote = _quote();
        require(quote.profit > 0, "no spread");
        lastExecutionTime = block.timestamp;

        require(quote.sellingWeth, "no spread");
        require(quote.amountOut < reserveUsdc, "liquidity");
        reserveWeth += quote.amountIn;
        reserveUsdc -= quote.amountOut;
        _burn(address(this), quote.amountIn);
        require(IERC20(usdcToken).transferFrom(owner, address(this), quote.amountOut), "pool usdc");
        uint256 profit = quote.amountOut - (quote.amountIn * quote.fair / WETH_UNIT);
        require(profit > 0, "no spread");
        emit StrategyExecuted(block.timestamp, "Venta", profit);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "zero amount");
        uint256 balance = IERC20(usdcToken).balanceOf(address(this));
        require(amount <= balance, "insufficient balance");
        require(IERC20(usdcToken).transfer(owner, amount), "transfer failed");
        emit Withdraw(owner, amount);
    }

    function checker() external view returns (bool canExec, bytes memory execPayload) {
        canExec = !paused && block.timestamp >= lastExecutionTime + executionCooldown && _priceFresh() && _quote().profit > 0;
        execPayload = abi.encodeCall(this.executeStrategy, ());
    }

    function _quote() internal view returns (Quote memory quote) {
        if (reserveUsdc == 0 || reserveWeth == 0 || !_priceFresh()) return quote;
        int256 ethPrice = getLatestPrice();
        if (ethPrice <= 0) return quote;
        uint256 fair = uint256(ethPrice) * USDC_UNIT / (10 ** uint256(feedDecimals));
        if (fair == 0) return quote;
        quote.fair = fair;

        uint256 wethIn = balanceOf[address(this)] * TRADE_BPS / 10_000;
        if (wethIn > 0) {
            uint256 usdcOut = _amountOut(wethIn, reserveWeth, reserveUsdc);
            uint256 fairValue = wethIn * fair / WETH_UNIT;
            uint256 minimum = fairValue + (fairValue * MIN_EDGE_BPS / 10_000);
            if (fairValue > 0 && usdcOut >= minimum && usdcOut > fairValue) {
                quote.sellingWeth = true;
                quote.amountIn = wethIn;
                quote.amountOut = usdcOut;
                quote.profit = usdcOut - fairValue;
            }
        }

    }

    function _amountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;
        uint256 inWithFee = amountIn * 997 / 1000;
        return reserveOut * inWithFee / (reserveIn + inWithFee);
    }

    function _priceFresh() internal view returns (bool) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();
        if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp || answeredInRound < roundId) return false;
        return block.timestamp - updatedAt <= PRICE_STALENESS;
    }

    function _burn(address from, uint256 amount) internal {
        uint256 balance = balanceOf[from];
        require(balance >= amount, "weth");
        balanceOf[from] = balance - amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
