// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// Chainlink v1.5 publica la interfaz en shared/interfaces, no en src/v0.8/interfaces.
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title LyraAutonomousAgent
/// @notice Guarda USDC, lee ETH/USD en Chainlink y deja que un keeper registre una ganancia simulada.
/// @dev `executeStrategy` la llama Gelato. No tiene onlyOwner. El agente ya desplegado en Amoy es otra versión.
contract LyraAutonomousAgent is Ownable, ReentrancyGuard {
    /// @dev Margen sobre el heartbeat de ETH/USD. Un feed más viejo no autoriza el trade.
    uint256 public constant PRICE_STALENESS = 3 hours;

    struct TradeLog {
        uint256 timestamp;
        string action;
        uint256 amount;
        string status;
    }

    address public immutable usdcToken;
    uint256 public immutable executionCooldown;
    uint8 public immutable feedDecimals;

    AggregatorV3Interface internal priceFeed;
    uint256 public lastExecutionTime;
    TradeLog[] public tradeHistory;

    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);
    event StrategyExecuted(uint256 timestamp, string action, uint256 profit);

    constructor(address _usdcAddress, address _priceFeedAddress, uint256 _cooldown) Ownable(msg.sender) {
        require(_usdcAddress != address(0), "LyraAutonomousAgent: zero usdc");
        require(_priceFeedAddress != address(0), "LyraAutonomousAgent: zero price feed");
        require(_cooldown > 0, "LyraAutonomousAgent: zero cooldown");

        usdcToken = _usdcAddress;
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
        executionCooldown = _cooldown;

        uint8 decimals_ = priceFeed.decimals();
        require(decimals_ > 0 && decimals_ <= 18, "LyraAutonomousAgent: bad decimals");
        feedDecimals = decimals_;
        // El cooldown empieza al desplegar. Si lastExecutionTime quedara en 0, la primera llamada entraría al momento.
        lastExecutionTime = block.timestamp;
    }

    /// @notice El owner deposita USDC. Hace falta allowance previa.
    function depositUSDC(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "LyraAutonomousAgent: zero amount");
        require(IERC20(usdcToken).transferFrom(msg.sender, address(this), amount), "LyraAutonomousAgent: transfer failed");
        emit Deposit(msg.sender, amount);
    }

    /// @notice Precio ETH/USD más reciente. Chainlink usa 8 decimales: 2000e8 significa 2000 USD.
    function getLatestPrice() public view returns (int256) {
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        return answer;
    }

    /// @notice Keeper. En testnet registra una ganancia simulada del 0.1 % y no mueve el USDC.
    function executeStrategy() external nonReentrant {
        require(block.timestamp >= lastExecutionTime + executionCooldown, "Cooldown active");

        int256 ethPrice = getLatestPrice();
        require(ethPrice > 0, "LyraAutonomousAgent: bad price");
        require(_priceFresh(), "LyraAutonomousAgent: stale price");

        // Decisión simulada: en testnet siempre hay oportunidad.
        // Una regla real iría aquí, por ejemplo si ethPrice está por debajo de un umbral.
        uint256 currentBalance = IERC20(usdcToken).balanceOf(address(this));
        require(currentBalance > 0, "No funds to operate");

        uint256 simulatedProfit = (currentBalance * 1) / 1000;

        lastExecutionTime = block.timestamp;
        tradeHistory.push(
            TradeLog({
                timestamp: block.timestamp,
                action: "ARB_TRADE",
                amount: simulatedProfit,
                status: "SUCCESS"
            })
        );

        emit StrategyExecuted(block.timestamp, "PROFIT_CAPTURED", simulatedProfit);
    }

    /// @notice El owner retira USDC hacia sí mismo, nunca más que el saldo del contrato.
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "LyraAutonomousAgent: zero amount");
        uint256 balance = IERC20(usdcToken).balanceOf(address(this));
        require(amount <= balance, "LyraAutonomousAgent: insufficient balance");
        require(IERC20(usdcToken).transfer(owner(), amount), "LyraAutonomousAgent: transfer failed");
        emit Withdraw(owner(), amount);
    }

    function tradeCount() external view returns (uint256) {
        return tradeHistory.length;
    }

    /// @notice Vista Gelato. `execPayload` llama a `executeStrategy()` sin argumentos.
    function checker() external view returns (bool canExec, bytes memory execPayload) {
        canExec = block.timestamp >= lastExecutionTime + executionCooldown
            && IERC20(usdcToken).balanceOf(address(this)) > 0
            && _priceFresh();
        execPayload = abi.encodeCall(this.executeStrategy, ());
    }

    /// @dev No revierte. Falso si la ronda está incompleta, el precio no es positivo o el dato pasó de 3 horas.
    function _priceFresh() internal view returns (bool) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp || answeredInRound < roundId) {
            return false;
        }
        return block.timestamp - updatedAt <= PRICE_STALENESS;
    }
}
