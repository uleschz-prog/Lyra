// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "./interfaces/IERC20.sol";
import {IProfitSwapRouter} from "./interfaces/IProfitSwapRouter.sol";

/// @title LyraAutonomousAgent
/// @notice Agente que guarda USDC y deja que un keeper ejecute un swap simulado.
/// @dev `executeStrategy` la llama un keeper (Gelato). No tiene onlyOwner.
contract LyraAutonomousAgent {
    uint256 public constant COOLDOWN = 10 minutes;

    address public owner;
    uint256 public lastExecutionTime;
    IERC20 public immutable usdc;
    IProfitSwapRouter public immutable router;

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

    constructor(address usdc_, address router_) {
        require(usdc_ != address(0), "LyraAutonomousAgent: zero usdc");
        require(router_ != address(0), "LyraAutonomousAgent: zero router");
        owner = msg.sender;
        usdc = IERC20(usdc_);
        router = IProfitSwapRouter(router_);
        // El cooldown empieza al desplegar: la primera ejecución espera 10 minutos.
        lastExecutionTime = block.timestamp;
    }

    /// @notice El owner deposita USDC. Hace falta allowance previa.
    function depositUSDC(uint256 amount) external onlyOwner {
        require(amount > 0, "LyraAutonomousAgent: zero amount");
        require(usdc.transferFrom(msg.sender, address(this), amount), "LyraAutonomousAgent: transfer failed");
        emit Deposit(msg.sender, amount);
    }

    /// @notice Keeper: si pasaron 10 minutos y hay USDC, cambia todo el saldo en el router mock.
    function executeStrategy() external {
        require(block.timestamp > lastExecutionTime + COOLDOWN, "LyraAutonomousAgent: cooldown");

        uint256 amountIn = usdc.balanceOf(address(this));
        require(amountIn > 0, "LyraAutonomousAgent: no balance");

        require(usdc.approve(address(router), amountIn), "LyraAutonomousAgent: approve failed");
        uint256 amountOut = router.swapUSDCForProfit(amountIn);

        lastExecutionTime = block.timestamp;

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
        canExec = block.timestamp > lastExecutionTime + COOLDOWN && usdc.balanceOf(address(this)) > 0;
        execPayload = abi.encodeCall(this.executeStrategy, ());
    }
}
