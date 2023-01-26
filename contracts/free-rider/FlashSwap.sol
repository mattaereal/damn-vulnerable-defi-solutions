// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol';


contract FlashSwap is IUniswapV2Callee  {

    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) public override {
        //address token0 = IUniswapV2Pair(msg.sender).token0(); // fetch the address of token0
        //address token1 = IUniswapV2Pair(msg.sender).token1(); // fetch the address of token1
        //assert(msg.sender == IUniswapV2Factory(factoryV2).getPair(token0, token1)); // ensure that msg.sender is a V2 pair
        // rest of the function goes here!

        // Single-Token
        // DAIReservePre - DAIWithdrawn + (DAIReturned * .997) >= DAIReservePre
    }

}
