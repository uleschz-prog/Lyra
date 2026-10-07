// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @notice Subconjunto de ERC-20 que usa el agente (USDC).
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
