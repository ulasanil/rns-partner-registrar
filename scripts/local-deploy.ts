import { ethers } from 'hardhat';
import { Contract, BigNumber, utils } from 'ethers';
import { PartnerRegistrar } from '../typechain-types/contracts/Registrar/PartnerRegistrar';
import { FeeManager } from '../typechain-types/contracts/FeeManager/FeeManager';
import { PartnerConfiguration } from '../typechain-types/contracts/PartnerConfiguration/PartnerConfiguration';
import fs from 'fs';
import { $RNS } from 'typechain-types/contracts-exposed/RNS.sol/$RNS';
import RNSAbi from '../test/external-abis/RNS.json';
import { deployContract, Factory } from 'utils/deployment.utils';
import { keccak256, namehash, toUtf8Bytes } from 'ethers/lib/utils';
import NodeOwnerAbi from '../test/external-abis/NodeOwner.json';
import { $NodeOwner } from 'typechain-types/contracts-exposed/NodeOwner.sol/$NodeOwner';
import { $Resolver } from 'typechain-types/contracts-exposed/test-utils/Resolver.sol/$Resolver';
import ResolverAbi from '../test/external-abis/ResolverV1.json';
import MultichainResolverAbi from '../test/external-abis/MultiChainResolver.json';
import NameResolverAbi from '../test/external-abis/NameResolver.json';
import ReverseSetupAbi from '../test/external-abis/ReverseSetup.json';
import { oneRBTC } from 'test/utils/mock.utils';
import { $PartnerManager } from 'typechain-types/contracts-exposed/PartnerManager/PartnerManager.sol/$PartnerManager';
import { $PartnerRegistrar } from 'typechain-types/contracts-exposed/Registrar/PartnerRegistrar.sol/$PartnerRegistrar';
import { $PartnerProxy } from 'typechain-types/contracts-exposed/PartnerProxy/PartnerProxy.sol/$PartnerProxy';
import { $PartnerProxyFactory } from 'typechain-types/contracts-exposed/PartnerProxy/PartnerProxyFactory.sol/$PartnerProxyFactory';
import { ERC677Token } from 'typechain-types';

const rootNodeId = ethers.constants.HashZero;
const tldNode = namehash('rsk');
const tldAsSha3 = utils.id('rsk');
const reverseTldNode = namehash('reverse');
const reverseTldAsSha3 = utils.id('reverse');
const FEE_PERCENTAGE = oneRBTC.mul(25); //5%

async function main() {
  try {
    const [owner, partner, userAccount, pool] = await ethers.getSigners();

    console.log('Deploying contracts with the account:', owner.address);

    const { contract: RNS } = await deployContract<$RNS>(
      'RNS',
      {},
      (await ethers.getContractFactory(
        RNSAbi.abi,
        RNSAbi.bytecode
      )) as Factory<$RNS>
    );

    const { contract: NodeOwner } = await deployContract<$NodeOwner>(
      'NodeOwner',
      {
        _rns: RNS.address,
        _rootNode: tldNode,
      },
      (await ethers.getContractFactory(
        NodeOwnerAbi.abi,
        NodeOwnerAbi.bytecode
      )) as Factory<$NodeOwner>
    );

    const { contract: Resolver } = await deployContract<$Resolver>(
      'ResolverV1',
      {},
      (await ethers.getContractFactory(
        ResolverAbi.abi,
        ResolverAbi.bytecode
      )) as Factory<$Resolver>
    );

    await (await Resolver.initialize(RNS.address)).wait();

    const { contract: MultiChainResolver } = await deployContract<Contract>(
      'MultiChainResolver',
      {
        _rns: RNS.address,
        _publicResolver: Resolver.address,
      },
      (await ethers.getContractFactory(
        MultichainResolverAbi.abi,
        MultichainResolverAbi.bytecode
      )) as Factory<Contract>
    );

    const { contract: NameResolver } = await deployContract<Contract>(
      'NameResolver',
      {
        _rns: RNS.address,
      },
      (await ethers.getContractFactory(
        NameResolverAbi.abi,
        NameResolverAbi.bytecode
      )) as Factory<Contract>
    );

    const { contract: ReverseRegistrar } = await deployContract<Contract>(
      'ReverseRegistrar',
      {
        _rns: RNS.address,
      },
      (await ethers.getContractFactory(
        NameResolverAbi.abi,
        NameResolverAbi.bytecode
      )) as Factory<Contract>
    );

    const { contract: ReverseSetup } = await deployContract<Contract>(
      'ReverseSetup',
      {
        _rns: RNS.address,
        _nameResolver: NameResolver.address,
        _reverseRegistrar: ReverseRegistrar.address,
        _from: owner.address,
      },
      (await ethers.getContractFactory(
        ReverseSetupAbi.abi,
        ReverseSetupAbi.bytecode
      )) as Factory<Contract>
    );

    const { contract: RIF } = await deployContract<ERC677Token>('ERC677Token', {
      beneficiary: owner.address,
      initialAmount: oneRBTC.mul(100000000000000),
      tokenName: 'ERC677',
      tokenSymbol: 'MOCKCOIN',
    });

    const { contract: PartnerManager } = await deployContract<$PartnerManager>(
      '$PartnerManager',
      {}
    );

    const { contract: PartnerRegistrar } =
      await deployContract<$PartnerRegistrar>('$PartnerRegistrar', {
        nodeOwner: NodeOwner.address,
        rif: RIF.address,
        partnerManager: PartnerManager.address,
        rns: RNS.address,
        rootNode: tldNode,
      });

    const { contract: FeeManager } = await deployContract<FeeManager>(
      'FeeManager',
      {
        rif: RIF.address,
        partnerRegistrar: PartnerRegistrar.address,
        partnerManager: PartnerManager.address,
        pool: pool.address,
      }
    );

    await (await PartnerRegistrar.setFeeManager(FeeManager.address)).wait();

    const { contract: DefaultPartnerConfiguration } =
      await deployContract<PartnerConfiguration>('PartnerConfiguration', {
        minLength: BigNumber.from(5),
        maxLength: BigNumber.from(20),
        isUnicodeSupported: true,
        minDuration: BigNumber.from(1),
        maxDuration: BigNumber.from(5),
        feePercentage: FEE_PERCENTAGE,
        discount: BigNumber.from(0),
        minCommittmentAge: BigNumber.from(0),
      });

    const { contract: PartnerProxyBase } = await deployContract<$PartnerProxy>(
      '$PartnerProxy',
      {}
    );

    const { contract: PartnerProxyFactory } =
      await deployContract<$PartnerProxyFactory>('$PartnerProxyFactory', {
        _masterProxy: PartnerProxyBase.address,
        _rif: RIF.address,
      });

    const FIFSADDRProxyName = 'FIFSADDR';
    await (
      await PartnerProxyFactory.createNewPartnerProxy(
        partner.address,
        FIFSADDRProxyName,
        PartnerRegistrar.address
      )
    ).wait();

    const FIFSADDRpartnerProxyAddress = (
      await PartnerProxyFactory.getPartnerProxy(
        partner.address,
        FIFSADDRProxyName
      )
    ).proxy;

    const FIFSProxyName = 'FIFS';
    await (
      await PartnerProxyFactory.createNewPartnerProxy(
        partner.address,
        FIFSProxyName,
        PartnerRegistrar.address
      )
    ).wait();

    const FIFSpartnerProxyAddress = (
      await PartnerProxyFactory.getPartnerProxy(partner.address, FIFSProxyName)
    ).proxy;

    console.log('setting up contracts');

    await (await PartnerManager.addPartner(FIFSADDRpartnerProxyAddress)).wait();

    await (
      await RNS.setSubnodeOwner(
        rootNodeId,
        reverseTldAsSha3,
        ReverseSetup.address
      )
    ).wait();

    await (await ReverseSetup.run()).wait();

    await (
      await RNS.setSubnodeOwner(rootNodeId, tldAsSha3, NodeOwner.address)
    ).wait();

    await (await NodeOwner.addRegistrar(PartnerRegistrar.address)).wait();

    await (await RNS.setDefaultResolver(Resolver.address)).wait();

    await (await NodeOwner.setRootResolver(Resolver.address)).wait();

    await (await PartnerRegistrar.setFeeManager(FeeManager.address)).wait();

    await (
      await PartnerManager.setPartnerConfiguration(
        FIFSADDRpartnerProxyAddress,
        DefaultPartnerConfiguration.address
      )
    ).wait();

    await (await RIF.transfer(userAccount.address, oneRBTC.mul(10))).wait();

    console.log('Writing contract addresses to file...');
    const content = {
      rns: RNS.address,
      registrar: PartnerRegistrar.address,
      reverseRegistrar: ReverseRegistrar.address,
      publicResolver: Resolver.address,
      nameResolver: NameResolver.address,
      multiChainResolver: MultiChainResolver.address,
      rif: RIF.address,
      fifsRegistrar: FIFSpartnerProxyAddress, // TODO
      fifsAddrRegistrar: FIFSADDRpartnerProxyAddress, // TODO
      rskOwner: NodeOwner.address,
      renewer: Resolver.address, // TODO
      partnerManager: PartnerManager.address,
      feeManager: FeeManager.address,
      defaultPartnerConfiguration: DefaultPartnerConfiguration.address,
      demoPartnerProxyInstance: FIFSADDRpartnerProxyAddress,
    };

    fs.writeFileSync(
      './deployedAddresses.json',
      JSON.stringify(content, null, 2)
    );

    console.log(
      'owner balance ',
      owner.address,
      ' ',
      (await RIF.balanceOf(owner.address)).toString()
    );
    console.log('Done.');
  } catch (err) {
    throw err;
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
