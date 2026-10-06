// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

import {IERC20} from "./interfaces/IERC20.sol";
import {IProfitSwapRouter} from "./interfaces/IProfitSwapRouter.sol";

/// @title LyraAutonomousAgent
/// @notice Agente que guarda USDC, lee el precio ETH/USD de Chainlink y deja que un keeper ejecute el swap.
/// @dev `executeStrategy` la llama un keeper (Gelato). No tiene onlyOwner.
contract LyraAutonomousAgent {
    uint256 public constant COOLDOWN = 10 minutes;

    /// @dev Margen sobre el heartbeat de ETH/USD. Un feed más viejo no autoriza el trade.
    uint256 public constant PRICE_STALENESS = 3 hours;

    address public owner;
    uint256 public lastExecutionTime;
    uint256 public lastEthPrice;
    uint256 public lastPriceUpdatedAt;
    IERC20 public immutable usdc;
    IProfitSwapRouter public immutable router;
    AggregatorV3Interface public immutable priceFeed;
    uint8 public immutable feedDecimals;

    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);
    event StrategyExecuted(
        address indexed agent,
        string action,
        string asset,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "LyraAutonomousAgent: not owner");
        _;
    }

    constructor(address usdc_, address router_, address priceFeed_) {
        require(usdc_ != address(0), "LyraAutonomousAgent: zero usdc");
        require(router_ != address(0), "LyraAutonomousAgent: zero router");
        require(priceFeed_ != address(0), "LyraAutonomousAgent: zero price feed");
        owner = msg.sender;
        usdc = IERC20(usdc_);
        router = IProfitSwapRouter(router_);
        priceFeed = AggregatorV3Interface(priceFeed_);
        uint8 decimals_ = priceFeed.decimals();
        require(decimals_ > 0 && decimals_ <= 18, "LyraAutonomousAgent: bad decimals");
        feedDecimals = decimals_;
        // El cooldown empieza al desplegar: la primera ejecución espera 10 minutos.
        lastExecutionTime = block.timestamp;
    }

    /// @notice El owner deposita USDC. Hace falta allowance previa.
    function depositUSDC(uint256 amount) external onlyOwner {
        require(amount > 0, "LyraAutonomousAgent: zero amount");
        require(usdc.transferFrom(msg.sender, address(this), amount), "LyraAutonomousAgent: transfer failed");
        emit Deposit(msg.sender, amount);
    }

    /// @notice Precio ETH/USD vigente. Revierte si la ronda está incompleta, el precio no es positivo o el dato está viejo.
    function latestEthUsd() external view returns (uint256 price, uint8 decimals, uint256 updatedAt) {
        (uint256 readPrice, uint256 updated, bool fresh) = _readEthUsd();
        require(fresh, "LyraAutonomousAgent: stale price");
        return (readPrice, feedDecimals, updated);
    }

    /// @notice Keeper: si pasaron 10 minutos, hay USDC y el feed ETH/USD está fresco, cambia todo el saldo.
    function executeStrategy() external {
        require(block.timestamp > lastExecutionTime + COOLDOWN, "LyraAutonomousAgent: cooldown");

        uint256 amountIn = usdc.balanceOf(address(this));
        require(amountIn > 0, "LyraAutonomousAgent: no balance");

        (uint256 price, uint256 updated, bool fresh) = _readEthUsd();
        require(fresh, "LyraAutonomousAgent: stale price");

        // Checks-effects-interactions. Si el router revierte, estos efectos también revierten.
        lastExecutionTime = block.timestamp;
        lastEthPrice = price;
        lastPriceUpdatedAt = updated;

        require(usdc.approve(address(router), amountIn), "LyraAutonomousAgent: approve failed");
        uint256 amountOut = router.swapUSDCForProfit(amountIn);

        emit StrategyExecuted(address(this), "BUY", "ETH", amountIn, amountOut, block.timestamp);
    }

    /// @notice El owner retira USDC hacia sí mismo, nunca más que el saldo del contrato.
    function withdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "LyraAutonomousAgent: zero amount");
        uint256 balance = usdc.balanceOf(address(this));
        require(amount <= balance, "LyraAutonomousAgent: insufficient balance");
        require(usdc.transfer(owner, amount), "LyraAutonomousAgent: transfer failed");
        emit Withdraw(owner, amount);
    }

    /// @notice Vista Gelato. `execPayload` llama a `executeStrategy()` sin argumentos.
    function checker() external view returns (bool canExec, bytes memory execPayload) {
        (, , bool fresh) = _readEthUsd();
        canExec = block.timestamp > lastExecutionTime + COOLDOWN && usdc.balanceOf(address(this)) > 0 && fresh;
        execPayload = abi.encodeCall(this.executeStrategy, ());
    }

    /// @dev No revierte. `fresh` es falso si el precio no sirve para tradear.
    function _readEthUsd() internal view returns (uint256 price, uint256 updatedAt, bool fresh) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updated,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        bool complete = answer > 0 && updated != 0 && updated <= block.timestamp && answeredInRound >= roundId;
        bool recent = complete && block.timestamp - updated <= PRICE_STALENESS;
        if (!recent) return (0, updated, false);
        return (uint256(answer), updated, true);
    }
}
