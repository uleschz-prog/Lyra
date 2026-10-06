// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @notice Interfaz mínima del router que llama el agente.
/// @dev Hoy la implementa MockSwapRouter. Después se sustituye por Uniswap.
interface IProfitSwapRouter {
    function swapUSDCForProfit(uint256 amountIn) external returns (uint256 amountOut);
}
