// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "../interfaces/IERC20.sol";

/// @notice Simula un swap: recibe USDC y devuelve más USDC (ganancia).
/// @dev La liquidez extra tiene que estar ya en este contrato. En tests se
///      mintea con MockERC20; este router no acuña tokens.
///      Este router se sustituye después por Uniswap (`swapExactTokensForTokens`).
contract MockSwapRouter {
    IERC20 public immutable usdc;

    /// @dev 10_000 = 100 %. 1000 = 10 % de ganancia sobre el amountIn.
    uint256 public immutable profitBps;

    event Swap(address indexed sender, uint256 amountIn, uint256 amountOut);

    constructor(address usdc_, uint256 profitBps_) {
        require(usdc_ != address(0), "MockSwapRouter: zero usdc");
        require(profitBps_ > 0, "MockSwapRouter: zero profit");
        usdc = IERC20(usdc_);
        profitBps = profitBps_;
    }

    function swapUSDCForProfit(uint256 amountIn) external returns (uint256 amountOut) {
        require(amountIn > 0, "MockSwapRouter: zero amount");
        require(usdc.transferFrom(msg.sender, address(this), amountIn), "MockSwapRouter: pull failed");

        amountOut = amountIn + (amountIn * profitBps) / 10_000;
        require(usdc.transfer(msg.sender, amountOut), "MockSwapRouter: payout failed");

        emit Swap(msg.sender, amountIn, amountOut);
    }
}
