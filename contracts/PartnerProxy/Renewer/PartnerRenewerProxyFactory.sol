// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.17;

import "./PartnerRenewerProxy.sol";
import "../CloneFactory.sol";
import "../../Registrar/IBaseRegistrar.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@rsksmart/erc677/contracts/IERC677.sol";

contract PartnerRenewerProxyFactory is Ownable, CloneFactory {
    struct Partner {
        string name;
        PartnerRenewerProxy proxy;
    }
    mapping(address => mapping(string => Partner)) private _partnerProxies;
    address private _masterProxy;
    uint256 public partnerProxyCount;
    IERC677 private _rif;

    event NewPartnerRenewerProxyCreated(
        PartnerRenewerProxy newPartnerProxy,
        Partner data
    );

    constructor(address masterProxy, IERC677 rif) Ownable() {
        _masterProxy = masterProxy;
        _rif = rif;
    }

    function createNewPartnerProxy(
        address partner,
        string calldata name,
        IBaseRegistrar partnerRegistrar,
        IBaseRenewer partnerRenewer
    ) external onlyOwner {
        PartnerRenewerProxy newPartnerProxy = PartnerRenewerProxy(
            _createClone(_masterProxy)
        );

        emit NewPartnerRenewerProxyCreated(
            newPartnerProxy,
            _partnerProxies[partner][name]
        );

        newPartnerProxy.init(partner, partnerRegistrar, partnerRenewer, _rif);
        partnerProxyCount++;
        _partnerProxies[partner][name] = Partner(name, newPartnerProxy);
    }

    function getPartnerProxiesCount() external view returns (uint256) {
        return partnerProxyCount;
    }

    function getPartnerProxy(address partner, string calldata name)
        external
        view
        returns (Partner memory)
    {
        return _partnerProxies[partner][name];
    }
}
