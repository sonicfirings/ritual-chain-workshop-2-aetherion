// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {RitualPredict} from "../contracts/RitualPredict.sol";
import {RitualChain} from "../contracts/ritual/RitualChain.sol";

contract SchedulerMock {
    function schedule(
        bytes calldata,
        uint32,
        uint32,
        uint32,
        uint32,
        uint32,
        uint256,
        uint256,
        uint256,
        address
    ) external pure returns (uint256) {
        return 123;
    }

    function cancel(uint256) external pure {}

    function getCallState(uint256) external pure returns (uint8) {
        return 0;
    }

    function approveScheduler(address) external pure {}
}

contract TEERegistryMock {
    function pickServiceByCapability(
        uint8 capability,
        bool checkValidity,
        uint256,
        uint256
    ) external pure returns (address teeAddress, bool found) {
        require(capability == RitualChain.CAPABILITY_HTTP_CALL);
        require(checkValidity);
        return (address(0xBEEF), true);
    }
}

contract EmptyTEERegistryMock {
    function pickServiceByCapability(
        uint8,
        bool,
        uint256,
        uint256
    ) external pure returns (address teeAddress, bool found) {
        return (address(0), false);
    }
}

contract HttpSuccessMock {
    fallback() external {
        string[] memory headerKeys = new string[](0);
        string[] memory headerValues = new string[](0);
        bytes memory actualOutput = abi.encode(
            uint16(200),
            headerKeys,
            headerValues,
            bytes('{"price":4500}'),
            ""
        );
        bytes memory raw = abi.encode(bytes(""), actualOutput);

        assembly {
            return(add(raw, 32), mload(raw))
        }
    }
}

contract HttpFailureMock {
    fallback() external {
        string[] memory headerKeys = new string[](0);
        string[] memory headerValues = new string[](0);
        bytes memory actualOutput = abi.encode(
            uint16(500),
            headerKeys,
            headerValues,
            bytes("server error"),
            ""
        );
        bytes memory raw = abi.encode(bytes(""), actualOutput);

        assembly {
            return(add(raw, 32), mload(raw))
        }
    }
}

contract JqUintMock {
    fallback() external {
        bytes memory raw = abi.encode(uint256(4500));

        assembly {
            return(add(raw, 32), mload(raw))
        }
    }
}

contract JqFailureMock {
    fallback() external {}
}

contract RitualPredictTest is Test {
    RitualPredict predict;

    address creator = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xCAFE);

    function setUp() public {
        _installBaseMocks();
        predict = new RitualPredict(200);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(creator, 10 ether);
    }

    function testCreateMarketStoresRuleAndSchedule() public {
        uint256 id = _createMarket();
        RitualPredict.Market memory m = predict.getMarket(id);

        assertEq(m.id, id);
        assertEq(m.creator, creator);
        assertEq(m.question, "Will ETH be at least 4000?");
        assertEq(m.oracleUrl, "https://oracle.example/eth");
        assertEq(m.jsonPath, ".price");
        assertEq(m.target, 4000);
        assertEq(uint8(m.comparator), uint8(RitualPredict.Comparator.GTE));
        assertEq(m.scheduleId, 123);
        assertEq(uint8(m.state), uint8(RitualPredict.MarketState.Open));
        assertGt(m.closeBlock, block.number);
        assertGt(m.resolveBlock, m.closeBlock);
    }

    function testRejectsBadCreateParams() public {
        RitualPredict.NewMarket memory p = _params();
        p.question = "";

        vm.prank(creator);
        vm.expectRevert(RitualPredict.EmptyString.selector);
        predict.createMarket(p);

        p = _params();
        p.bettingSeconds = 1;

        vm.prank(creator);
        vm.expectRevert(RitualPredict.BadDuration.selector);
        predict.createMarket(p);
    }

    function testBettingClosesAtCloseBlock() public {
        uint256 id = _createMarket();
        RitualPredict.Market memory m = predict.getMarket(id);

        vm.roll(m.closeBlock);

        vm.prank(alice);
        vm.expectRevert(RitualPredict.BettingClosed.selector);
        predict.bet{value: 1 ether}(id, true);
    }

    function testScheduledResolvePaysWinningSide() public {
        uint256 id = _createMarket();
        _bet(id, alice, true, 1 ether);
        _bet(id, bob, false, 1 ether);

        RitualPredict.Market memory beforeResolve = predict.getMarket(id);
        vm.roll(beforeResolve.resolveBlock);

        vm.prank(RitualChain.SCHEDULER);
        predict.onScheduledResolve(0, id);

        RitualPredict.Market memory afterResolve = predict.getMarket(id);
        assertEq(
            uint8(afterResolve.state),
            uint8(RitualPredict.MarketState.Resolved)
        );
        assertEq(uint8(afterResolve.outcome), uint8(RitualPredict.Outcome.Yes));
        assertEq(afterResolve.observedValue, 4500);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        predict.claimWinnings(id);
        assertEq(alice.balance, aliceBefore + 2 ether);

        vm.prank(bob);
        vm.expectRevert(RitualPredict.NothingToClaim.selector);
        predict.claimWinnings(id);
    }

    function testEmptyWinningSideMakesMarketRefundable() public {
        uint256 id = _createMarket();
        _bet(id, bob, false, 1 ether);

        RitualPredict.Market memory beforeResolve = predict.getMarket(id);
        vm.roll(beforeResolve.resolveBlock);

        vm.prank(RitualChain.SCHEDULER);
        predict.onScheduledResolve(0, id);

        RitualPredict.Market memory afterResolve = predict.getMarket(id);
        assertEq(
            uint8(afterResolve.state),
            uint8(RitualPredict.MarketState.Invalid)
        );
        assertEq(afterResolve.invalidReason, "empty winning side");

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        predict.claimRefund(id);
        assertEq(bob.balance, bobBefore + 1 ether);
    }

    function testOracleFailuresInvalidateAfterMaxAttempts() public {
        _etch(RitualChain.HTTP_PRECOMPILE, address(new HttpFailureMock()));

        uint256 id = _createMarket();
        _bet(id, alice, true, 1 ether);
        _bet(id, bob, false, 1 ether);

        RitualPredict.Market memory beforeResolve = predict.getMarket(id);
        vm.roll(beforeResolve.resolveBlock);

        for (uint256 i = 0; i < predict.MAX_ATTEMPTS(); i++) {
            vm.prank(RitualChain.SCHEDULER);
            predict.onScheduledResolve(i, id);
        }

        RitualPredict.Market memory afterResolve = predict.getMarket(id);
        assertEq(
            uint8(afterResolve.state),
            uint8(RitualPredict.MarketState.Invalid)
        );
        assertEq(afterResolve.attempts, predict.MAX_ATTEMPTS());
        assertEq(afterResolve.invalidReason, "http status");
    }

    function testMissingExecutorCountsAsFailedAttempt() public {
        _etch(
            RitualChain.TEE_SERVICE_REGISTRY,
            address(new EmptyTEERegistryMock())
        );

        uint256 id = _createMarket();
        _bet(id, alice, true, 1 ether);

        RitualPredict.Market memory beforeResolve = predict.getMarket(id);
        vm.roll(beforeResolve.resolveBlock);

        vm.prank(RitualChain.SCHEDULER);
        predict.onScheduledResolve(0, id);

        RitualPredict.Market memory afterResolve = predict.getMarket(id);
        assertEq(
            uint8(afterResolve.state),
            uint8(RitualPredict.MarketState.Resolving)
        );
        assertEq(afterResolve.attempts, 1);
    }

    function testOnlySchedulerMayResolve() public {
        uint256 id = _createMarket();

        vm.expectRevert(RitualPredict.OnlyScheduler.selector);
        predict.onScheduledResolve(0, id);
    }

    function _installBaseMocks() private {
        _etch(RitualChain.SCHEDULER, address(new SchedulerMock()));
        _etch(RitualChain.TEE_SERVICE_REGISTRY, address(new TEERegistryMock()));
        _etch(RitualChain.HTTP_PRECOMPILE, address(new HttpSuccessMock()));
        _etch(RitualChain.JQ_PRECOMPILE, address(new JqUintMock()));
    }

    function _etch(address target, address implementation) private {
        vm.etch(target, implementation.code);
    }

    function _createMarket() private returns (uint256) {
        vm.prank(creator);
        return predict.createMarket(_params());
    }

    function _params()
        private
        pure
        returns (RitualPredict.NewMarket memory p)
    {
        p = RitualPredict.NewMarket({
            question: "Will ETH be at least 4000?",
            oracleUrl: "https://oracle.example/eth",
            jsonPath: ".price",
            target: 4000,
            comparator: RitualPredict.Comparator.GTE,
            bettingSeconds: 60,
            resolveDelaySeconds: 30
        });
    }

    function _bet(
        uint256 marketId,
        address bettor,
        bool isYes,
        uint256 amount
    ) private {
        vm.prank(bettor);
        predict.bet{value: amount}(marketId, isYes);
    }
}
