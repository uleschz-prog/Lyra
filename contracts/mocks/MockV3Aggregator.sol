// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @notice Feed mínimo con la forma de AggregatorV3Interface, solo para tests.
contract MockV3Aggregator {
    uint8 public immutable decimals;
    int256 public answer;
    uint80 public roundId = 1;
    uint80 public answeredInRound = 1;
    uint256 public updatedAt;

    constructor(uint8 decimals_, int256 answer_) {
        require(decimals_ > 0, "MockV3Aggregator: zero decimals");
        decimals = decimals_;
        answer = answer_;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }

    function setRound(int256 answer_, uint256 updatedAt_, uint80 roundId_, uint80 answeredInRound_) external {
        answer = answer_;
        updatedAt = updatedAt_;
        roundId = roundId_;
        answeredInRound = answeredInRound_;
    }
}
