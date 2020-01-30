const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const IdleETH = artifacts.require('IdleETH');
const IdleETHPriceCalculator = artifacts.require('IdleETHPriceCalculator');
const IdleRebalancerMock = artifacts.require('IdleRebalancerMock');
const IdleFactory = artifacts.require('IdleFactory');
const WhitePaperMock = artifacts.require('WhitePaperMock');
const cETHMock = artifacts.require('cETHMock');
const iETHMock = artifacts.require('iETHMock');
const cETHWrapperMock = artifacts.require('cETHWrapperMock');
const iETHWrapperMock = artifacts.require('iETHWrapperMock');
// used to test _rebalanceCheck
const IdleFakeETH = artifacts.require('IdleETHWithPublicRebalanceCheck');
//
const BNify = n => new BN(String(n));

contract('IdleETH', function ([_, creator, nonOwner, someone, foo, a, b, c, d, e]) {
  before(async () => {
    // Give 500 ETH to `creator`
    await web3.eth.sendTransaction({to: creator, value: BNify('99000000000000000000'), from: a });
    await web3.eth.sendTransaction({to: creator, value: BNify('99000000000000000000'), from: b });
    await web3.eth.sendTransaction({to: creator, value: BNify('99000000000000000000'), from: c });
    await web3.eth.sendTransaction({to: creator, value: BNify('99000000000000000000'), from: d });
    await web3.eth.sendTransaction({to: creator, value: BNify('99000000000000000000'), from: e });
  });
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.oneCToken = new BN('100000000'); // 8 decimals
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';

    this.WhitePaperMock = await WhitePaperMock.new({from: creator});
    this.cETHMock = await cETHMock.new(creator, this.WhitePaperMock.address, {from: creator});
    this.iETHMock = await iETHMock.new(creator, {from: creator});

    // Use mocked wrappers
    this.cETHWrapper = await cETHWrapperMock.new(
      this.cETHMock.address,
      {from: creator}
    );
    this.iETHWrapper = await iETHWrapperMock.new(
      this.iETHMock.address,
      {from: creator}
    );

    this.IdleRebalancer = await IdleRebalancerMock.new(
      this.cETHMock.address,
      this.iETHMock.address,
      this.cETHWrapper.address,
      this.iETHWrapper.address,
      { from: creator }
    );
    this.PriceCalculator = await IdleETHPriceCalculator.new({ from: creator });

    this.token = await IdleETH.new(
      'IdleETH',
      'IDLEETH',
      18,
      this.cETHMock.address, this.iETHMock.address,
      this.IdleRebalancer.address,
      this.PriceCalculator.address,
      this.cETHWrapper.address, this.iETHWrapper.address,
      { from: creator }
    );
    this.idleTokenAddr = this.token.address;

    await this.IdleRebalancer.setIdleToken(this.idleTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleTokenAddr, {from: creator});

    // Fake Factory which uses IdleTokenWithPublicRebalanceCheck for testing rebalanceCheck
    this.fakeToken = await IdleFakeETH.new(
      'IdleETH',
      'IDLEETH',
      18,
      this.cETHMock.address, this.iETHMock.address,
      this.IdleRebalancer.address,
      this.PriceCalculator.address,
      this.cETHWrapper.address, this.iETHWrapper.address,
      { from: creator }
    );
    this.idleFakeTokenAddr = this.fakeToken.address;

    // helper methods
    this.mintIdle = async (amount, who) => {
      // Give ETH to `who`
      await web3.eth.sendTransaction({to: who, value: amount, from: creator });
      await this.token.mintIdleToken([], {value: amount, from: who });
    };
    this.fakeMintIdle = async (amount, who) => {
      // Give ETH to `who`
      await web3.eth.sendTransaction({to: who, value: amount, from: creator });
      await this.fakeToken.mintIdleToken([], {value: amount, from: who });
    };

    this.getParamsForMintIdleToken = async (amount, who) => {
      // Give ETH to `who`
      await web3.eth.sendTransaction({to: who, value: amount, from: creator });
      return await this.token.getParamsForMintIdleToken.call({value: amount, from: who });
    };
  });

  it('constructor set a name', async function () {
    (await this.token.name()).should.equal('IdleETH');
  });
  it('constructor set a symbol', async function () {
    (await this.token.symbol()).should.equal('IDLEETH');
  });
  it('constructor set a decimals', async function () {
    (await this.token.decimals()).should.be.bignumber.equal(BNify('18'));
  });
  it('constructor set a iToken (iETH) address', async function () {
    (await this.token.iToken()).should.equal(this.iETHMock.address);
  });
  it('constructor set a rebalance address', async function () {
    (await this.token.rebalancer()).should.equal(this.IdleRebalancer.address);
  });
  it('constructor set a rebalance address', async function () {
    (await this.token.priceCalculator()).should.equal(this.PriceCalculator.address);
  });
  it('constructor set a protocolWrapper for cToken', async function () {
    (await this.token.protocolWrappers(this.cETHMock.address)).should.equal(this.cETHWrapper.address);
  });
  it('constructor set a protocolWrapper for iToken', async function () {
    (await this.token.protocolWrappers(this.iETHMock.address)).should.equal(this.iETHWrapper.address);
  });
  it('constructor set allAvailableTokens', async function () {
    (await this.token.allAvailableTokens(0)).should.equal(this.cETHMock.address);
    (await this.token.allAvailableTokens(1)).should.equal(this.iETHMock.address);
  });
  it('constructor set minRateDifference', async function () {
    (await this.token.minRateDifference()).should.be.bignumber.equal(BNify(10**17));
  });
  it('allows onlyOwner to setManualPlay', async function () {
    const val = true;
    await this.token.setManualPlay(val, { from: creator });
    (await this.token.manualPlay()).should.be.equal(val);

    await expectRevert.unspecified(this.token.setManualPlay(val, { from: nonOwner }));
  });
  it('allows onlyOwner to setIToken', async function () {
    const val = this.someAddr;
    await this.token.setIToken(val, { from: creator });
    (await this.token.iToken()).should.be.equal(val);

    await expectRevert.unspecified(this.token.setIToken(val, { from: nonOwner }));
  });
  it('allows onlyOwner to setRebalancer', async function () {
    const val = this.someAddr;
    await this.token.setRebalancer(val, { from: creator });
    (await this.token.rebalancer()).should.be.equal(val);

    await expectRevert.unspecified(this.token.setRebalancer(val, { from: nonOwner }));
  });
  it('allows onlyOwner to setPriceCalculator', async function () {
    const val = this.someAddr;
    await this.token.setPriceCalculator(val, { from: creator });
    (await this.token.priceCalculator()).should.be.equal(val);

    await expectRevert.unspecified(this.token.setPriceCalculator(val, { from: nonOwner }));
  });
  it('allows onlyOwner to setProtocolWrapper', async function () {
    const _token = this.someAddr;
    const _wrapper = this.someOtherAddr;
    await this.token.setProtocolWrapper(_token, _wrapper, { from: creator });
    (await this.token.protocolWrappers(_token)).should.equal(_wrapper);
    (await this.token.allAvailableTokens(2)).should.equal(_token);
    await expectRevert.assertion(this.token.allAvailableTokens(3)); // array out-of-bound
    // retest to see that it does not push _token another time
    await this.token.setProtocolWrapper(_token, foo, { from: creator });
    (await this.token.protocolWrappers(_token)).should.equal(foo);
    (await this.token.allAvailableTokens(2)).should.equal(_token);
    await expectRevert.assertion(this.token.allAvailableTokens(3)); // array out-of-bound
    // nonOwner
    await expectRevert.unspecified(this.token.setProtocolWrapper(_token, _wrapper, { from: nonOwner }));
  });
  it('allows onlyOwner to setMinRateDifference ', async function () {
    const val = BNify(10**18);
    await this.token.setMinRateDifference(val, { from: creator });
    (await this.token.minRateDifference()).should.be.bignumber.equal(val);

    await expectRevert.unspecified(this.token.setMinRateDifference(val, { from: nonOwner }));
  });
  it('calculates current tokenPrice when IdleToken supply is 0', async function () {
    const res = await this.token.tokenPrice.call();
    const expectedRes = this.one;
    res.should.be.bignumber.equal(expectedRes);
  });
  it('calculates current tokenPrice when funds are all in one pool', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.iETHWrapper._setPriceInToken(BNify('1100000000000000000')); // 1.1ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    // await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    // await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // First mint with tokenPrice = 1
    // all funds will be sent to one protocol (Compound)
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('10').mul(this.one), BNify('0').mul(this.one)]
    );
    // Approve and Mint 10 ETH, all on Compound so 10 / 0.02 = 500 cETH in idle pool
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // and 500 cETH will be minted to IdleETH contract
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('500').mul(this.oneCToken));

    // After some time price of cETH has increased
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025 ETH
    // Used for when wrapper calls mint on cETHMock
    // NOTE: for Fulcrum rate should be higher then _setPriceInToken due to fee
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    // when redeeming now we redeem more ETH of what cETHMock has so we transfer ETH to the contract
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('2500000000000000000'), from: creator });
    // await this.ETHMock.transfer(this.cETHMock.address, BNify('15').mul(this.one), { from: creator });

    const res1 = await this.token.tokenPrice.call();
    // current nav is 500 * 0.025 = 12.5 ETH
    // idleToken supply 10
    // currTokenPrice = 12.5 / 10 = 1.25
    res1.should.be.bignumber.equal(BNify('1250000000000000000'));

    // Prepare fake data for rebalanceCheck
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('1100000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    // everything will go to Compound because next supply rate of compound is > of current Fulcrum rate

    // Approve and Mint 20 ETH, all on Compound so 20 / 0.025 = 800 cETH in idle pool
    await this.mintIdle(BNify('20').mul(this.one), nonOwner);

    // total cETH pool 1300 cETH
    // tokenPrice is still 1.25 here
    // so 20 / 1.25 = 16 IdleETH minted
    const price2 = await this.token.tokenPrice.call();
    // current nav is 1300 * 0.025 = 32.5 ETH
    // idleToken supply 26
    // currTokenPrice = 32.5 / 26 = 1.25
    price2.should.be.bignumber.equal(BNify('1250000000000000000'));

    await this.cETHWrapper._setPriceInToken(BNify('300000000000000000000000000')); // 0.03

    const res = await this.token.tokenPrice.call();
    // 1300 * 0.03 = 39 ETH (nav of cETH pool)
    // totNav = 39 ETH
    // totSupply = 26 IdleETH
    const expectedRes = BNify('1500000000000000000'); // 1.5
    res.should.be.bignumber.equal(expectedRes);
  });
  it('calculates current tokenPrice when funds are in different pools', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // First mint with tokenPrice = 1
    // all funds will be sent to one protocol (Compound)
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // After some time price of cETH has increased
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025 ETH
    // Used for when wrapper calls `mint` on cETHMock
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    // when redeeming now we redeem more ETH of what cETHMock has so we transfer ETH to the contract
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('2500000000000000000'), from: creator });

    // After some time price of iETH has increased
    await this.iETHWrapper._setPriceInToken(BNify('1500000000000000000')); // 1.5 ETH
    // Used for when wrapper calls `mint` on iETHMock
    // NOTE: for Fulcrum rate should be higher then _setPriceInToken due to fee
    // await this.iETHMock._setPriceForTest(BNify('1650000000000000000')); // 1.65 ETH
    await this.iETHMock.setPriceForTest(BNify('1500000000000000000')); // 1.65 ETH
    // when redeeming now we redeem more ETH of what cETHMock has so we transfer ETH to the contract
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('1').mul(this.one), from: creator });

    const res1 = await this.token.tokenPrice.call();
    // current nav cETH pool is 250 * 0.025 = 6.25 ETH
    // current nav iETH pool is 4 * 1.5 = 6 ETH
    // idleToken supply 10
    // currTokenPrice = (6.25 + 6) / 10 = 1.225
    res1.should.be.bignumber.equal(BNify('1225000000000000000'));

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('12250000000000000000'), BNify('20').mul(this.one)]
    );

    // Approve and Mint 20 ETH
    await this.mintIdle(BNify('20').mul(this.one), nonOwner);

    // total cETH pool 12.25 / 0.025 = 490 cETH
    // total iETH pool 20 / 1.5 = 13.33333 iETH

    // tokenPrice is still 1.225 here
    // so 20 / 1.225 = 16.3265306122 IdleETH minted
    const price2 = await this.token.tokenPrice.call();
    // current nav cETH pool is 490 * 0.025 = 12.25 ETH
    // current nav iETH pool is 13.33333 * 1.5 = 20 ETH
    // idleToken supply 26.3265306122
    // currTokenPrice = 32.25 / 26.3265306122 = 1.225
    price2.should.be.bignumber.equal(BNify('1224999999999999999'));

    await this.cETHWrapper._setPriceInToken(BNify('300000000000000000000000000')); // 0.03

    const res = await this.token.tokenPrice.call();
    // 490 * 0.03 = 14.7 ETH (nav of cETH pool)
    // totNav = 14.7 + 20 = 34.7 ETH
    // totSupply = 26.3265306122 IdleETH
    const expectedRes = BNify('1318062015503875968'); // 1.318...
    res.should.be.bignumber.equal(expectedRes);
  });
  it('get all APRs from every protocol', async function () {
    // Prepare fake data for getAPR
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('1100000000000000000')); // 1.1%

    const res = await this.token.getAPRs.call();
    res.addresses[0].should.be.equal(this.cETHMock.address);
    res.addresses[1].should.be.equal(this.iETHMock.address);
    res.aprs[0].should.be.bignumber.equal(BNify('2200000000000000000'));
    res.aprs[1].should.be.bignumber.equal(BNify('1100000000000000000'));
  });
  it('mints idle tokens', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.iETHWrapper._setPriceInToken(BNify('1100000000000000000')); // 1.1ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // First mint with tokenPrice = 1
    // all funds will be sent to one protocol (Compound)
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('10').mul(this.one), BNify('0').mul(this.one)]
    );
    // Approve and Mint 10 ETH, all on Compound so 10 / 0.02 = 500 cETH in idle pool
    // tokenPrice is 1 here

    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // and 500 cETH will be minted to IdleETH contract
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('500').mul(this.oneCToken));

    // After some time price of cETH has increased
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025 ETH
    // Used for when wrapper calls mint on cETHMock
    // NOTE: for Fulcrum rate should be higher then _setPriceInToken due to fee
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    // when redeeming now we redeem more ETH of what cETHMock has so we transfer ETH to the contract
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('2500000000000000000'), from: creator });
    // currTokenPrice = 12.5 / 10 = 1.25

    // Prepare fake data for rebalanceCheck
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('1100000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    // everything will go to Compound because next supply rate of compound is > of current Fulcrum rate

    // Approve and Mint 20 ETH, all on Compound so 20 / 0.025 = 800 cETH in idle pool
    await this.mintIdle(BNify('20').mul(this.one), nonOwner);

    // so 20 ETH will be transferred from nonOwner
    // const resBalanceETH2 = await web3.eth.getBalance(nonOwner);
    // resBalanceETH2.should.be.bignumber.equal(BNify('0').mul(this.one));
    // total cETH pool 1300 cETH
    // tokenPrice is still 1.25 here
    // so 20 / 1.25 = 16 IdleETH minted to nonOwner
    const resBalanceIdle2 = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle2.should.be.bignumber.equal(BNify('26').mul(this.one));
    // and 500 cETH will be minted to IdleETH contract
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance2.should.be.bignumber.equal(BNify('1300').mul(this.oneCToken));
  });
  it('getCurrentAllocations', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.iETHWrapper._setPriceInToken(BNify('1100000000000000000')); // 1.1ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // First mint with tokenPrice = 1
    // all funds will be sent to one protocol (Compound)
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('10').mul(this.one), BNify('22').mul(this.one)]
    );

    // Set idle token address to idleFakeTokenAddr
    await this.IdleRebalancer.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});

    // Approve and Mint 10 ETH, all on Compound so 10 / 0.02 = 500 cETH in idle pool
    // tokenPrice is 1 here
    await this.fakeMintIdle(BNify('32').mul(this.one), nonOwner);

    // const resGetParams = await this.getParamsForMintIdleToken(BNify('10').mul(this.one), nonOwner);
    const resGetParams = await this.fakeToken.getCurrentAllocations.call({ from: nonOwner });
    resGetParams[0][0].should.be.equal(this.cETHMock.address);
    resGetParams[0][1].should.be.equal(this.iETHMock.address);

    resGetParams[1][0].should.be.bignumber.equal(BNify('10').mul(this.one));
    resGetParams[1][1].should.be.bignumber.equal(BNify('22').mul(this.one));
  });
  it('getParamsForMintIdleToken', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.iETHWrapper._setPriceInToken(BNify('1100000000000000000')); // 1.1ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // First mint with tokenPrice = 1
    // all funds will be sent to one protocol (Compound)
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('10').mul(this.one), BNify('22').mul(this.one)]
    );

    // tokenPrice is 1 here
    const resGetParams = await this.getParamsForMintIdleToken(BNify('32').mul(this.one), nonOwner);
    resGetParams[0][0].should.be.equal(this.cETHMock.address);
    resGetParams[0][1].should.be.equal(this.iETHMock.address);

    resGetParams[1][0].should.be.bignumber.equal(BNify('10').mul(this.one));
    resGetParams[1][1].should.be.bignumber.equal(BNify('22').mul(this.one));
  });
  it('cannot mints if iToken price has decreased', async function () {
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('1100000000000000000')); // 1.1%

    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    const price = await this.token.lastITokenPrice.call();
    price.should.be.bignumber.equal(BNify('1250000000000000000'));
    await this.iETHMock.setPriceForTest(BNify('1000000000000000000')); // 1.25ETH
    await expectRevert(
      this.mintIdle(BNify('10').mul(this.one), nonOwner),
      'Paused: iToken price decreased'
    );
  });
  it('can mints if iToken price has decreased and contract has been manually played', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // all funds will be sent to one protocol (Compound)
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('10').mul(this.one), BNify('0').mul(this.one)]
    );

    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    const price = await this.token.lastITokenPrice.call();
    price.should.be.bignumber.equal(BNify('1250000000000000000'));
    await this.iETHMock.setPriceForTest(BNify('1000000000000000000')); // 1.25ETH

    await this.token.setManualPlay(true, {from: creator});
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // lastITokenPrice should not be updated
    const price2 = await this.token.lastITokenPrice.call();
    price2.should.be.bignumber.equal(BNify('1250000000000000000'));
  });
  it('after mints lastITokenPrice is updated if has increased', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // all funds will be sent to one protocol (Compound)
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('10').mul(this.one), BNify('0').mul(this.one)]
    );

    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    const price = await this.token.lastITokenPrice.call();
    price.should.be.bignumber.equal(BNify('1250000000000000000'));

    await this.iETHMock.setPriceForTest(BNify('1300000000000000000'));
    await this.iETHWrapper._setPriceInToken(BNify('1300000000000000000')); // 1.25ETH
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    const price2 = await this.token.lastITokenPrice.call();
    price2.should.be.bignumber.equal(BNify('1300000000000000000'));
  });
  it('cannot mints idle tokens when paused', async function () {
    await this.token.pause({from: creator});
    await web3.eth.sendTransaction({to: nonOwner, value: BNify('10').mul(this.one), from: creator });
    await expectRevert.unspecified(this.token.mintIdleToken([], {value: BNify('10').mul(this.one), from: nonOwner }));
  });
  it('does not redeem if idleToken total supply is 0', async function () {
    await expectRevert.unspecified(this.token.redeemIdleToken(BNify('10').mul(this.one), false, [], { from: nonOwner }));
  });
  it('redeems idle tokens', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.02 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // First mint with tokenPrice = 1
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // used for rebalance at the end of the redeem method
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('0').mul(this.one), BNify('0').mul(this.one)]
    );

    // Redeems 10 IdleETH
    const redeemedTokens = await this.token.redeemIdleToken.call(BNify('10').mul(this.one), false, [], {from: nonOwner});
    redeemedTokens.should.be.bignumber.equal(BNify('10').mul(this.one));

    await this.token.redeemIdleToken(BNify('10').mul(this.one), false, [], {from: nonOwner});
    // so nonOwner has no IdleETH
    const resBalanceIdle2 = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle2.should.be.bignumber.equal(BNify('0').mul(this.one));
    // IdleETH have been burned
    const resSupply = await this.token.totalSupply.call({ from: nonOwner });
    resSupply.should.be.bignumber.equal(BNify('0').mul(this.one));
    // there are no cETH in Idle contract
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance2.should.be.bignumber.equal(BNify('0').mul(this.oneCToken));
    // there are no iETH in Idle contract
    const resBalanceIETH2 = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH2.should.be.bignumber.equal(BNify('0').mul(this.one));
    // 10 ETH are given back to nonOwner
    const resBalanceETH = await web3.eth.getBalance(nonOwner);

    // curr balance should be 100 ETH - some gas fee + gains from prev tests
    resBalanceETH.should.be.bignumber.equal(BNify('161931136080000000000'));
  });
  it('redeems idle tokens and rebalances', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.02 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%

    // First mint with tokenPrice = 1
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH for nonOwner,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // update prices
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1300000000000000000')); // 1.30ETH
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH

    // 250 * 0.025 = 6.25 ETH nav of cETH pool
    // so we transfer 1.25 ETH to cETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('1250000000000000000'), from: creator });
    // 4 * 1.3 = 5.2 ETH nav of iETH pool
    // so we transfer 1.2 ETH to iETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('1200000000000000000'), from: creator });
    // tokenPrice is now (6.25 + 5.2) / 10 = 1.145 ETH per idleETH

    // 11.45 total ETH nav + 10 ETH minted now
    // we set them all on Compound
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('21450000000000000000'), BNify('0').mul(this.one)] // 21.45 ETH, 0 ETH
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1.145 here
    await this.mintIdle(BNify('10').mul(this.one), someone);
    // so 10 / 1.145 IdleETH will be minted to nonOwner
    const resBalanceIdle2 = await this.token.balanceOf.call(someone, { from: someone });
    resBalanceIdle2.should.be.bignumber.equal(BNify('8733624454148471615')); // 8.73362445415
    // 21.45 / 0.025 = 858 cETH
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalance2.should.be.bignumber.equal(BNify('858').mul(this.oneCToken));
    // iETH pool is empty now
    const resBalanceIETH2 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH2.should.be.bignumber.equal(BNify('0').mul(this.one));

    // Prepare fake data for rebalanceCheck
    await this.cETHWrapper._setAPR(BNify('1000000000000000000')); // 1%
    await this.iETHWrapper._setAPR(BNify('1100000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('900000000000000000')); // 0.9%
    // everything will go to Compound because next supply rate of compound is > of current Fulcrum rate

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('0'), BNify('8733624454148471615')] // 0 ETH, 8.73362445415 ETH
    );

    // Redeems 10 IdleETH
    const redeemedTokens = await this.token.redeemIdleToken.call(BNify('10').mul(this.one), false, [], {from: nonOwner});
    redeemedTokens.should.be.bignumber.equal(BNify('11450000000000000000')); // 11.45 ETH

    await this.token.redeemIdleToken(BNify('10').mul(this.one), false, [], {from: nonOwner});
    // so nonOwner has no IdleETH
    const resBalanceIdle3 = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle3.should.be.bignumber.equal(BNify('0').mul(this.one));
    // 10 IdleETH have been burned
    const resSupply = await this.token.totalSupply.call({ from: nonOwner });
    resSupply.should.be.bignumber.equal(BNify('8733624454148471615'));
    // there are no cETH in Idle contract
    const resBalance3 = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance3.should.be.bignumber.equal(BNify('0').mul(this.oneCToken));

    // there are 8.733624454148471615 / 1.3 = 6.718172657037285857 iETH
    const resBalanceIETH3 = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH3.should.be.bignumber.equal(BNify('6718172657037285857'));
    // 11.45 ETH are given back to nonOwner
    const resBalanceETH3 = await web3.eth.getBalance(nonOwner);
    // it should be 100 + 11.45 - some gas fee + gains from prev tests
    resBalanceETH3.should.be.bignumber.equal(BNify('173370309700000000000')); // 11.45
  });
  it('getParamsForRedeemIdleToken', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.02 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%

    // First mint with tokenPrice = 1
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH for nonOwner,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // update prices
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1300000000000000000')); // 1.30ETH
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH

    // 250 * 0.025 = 6.25 ETH nav of cETH pool
    // so we transfer 1.25 ETH to cETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('1250000000000000000'), from: creator });
    // 4 * 1.3 = 5.2 ETH nav of iETH pool
    // so we transfer 1.2 ETH to iETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('1200000000000000000'), from: creator });
    // tokenPrice is now (6.25 + 5.2) / 10 = 1.145 ETH per idleETH

    // 11.45 total ETH nav + 10 ETH minted now
    // we set them all on Compound
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('21450000000000000000'), BNify('0').mul(this.one)] // 21.45 ETH, 0 ETH
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1.145 here
    await this.mintIdle(BNify('10').mul(this.one), someone);
    // so 10 / 1.145 IdleETH will be minted to nonOwner
    const resBalanceIdle2 = await this.token.balanceOf.call(someone, { from: someone });
    resBalanceIdle2.should.be.bignumber.equal(BNify('8733624454148471615')); // 8.73362445415
    // 21.45 / 0.025 = 858 cETH
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalance2.should.be.bignumber.equal(BNify('858').mul(this.oneCToken));
    // iETH pool is empty now
    const resBalanceIETH2 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH2.should.be.bignumber.equal(BNify('0').mul(this.one));

    // Prepare fake data for rebalanceCheck
    await this.cETHWrapper._setAPR(BNify('1000000000000000000')); // 1%
    await this.iETHWrapper._setAPR(BNify('1100000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('900000000000000000')); // 0.9%
    // everything will go to Compound because next supply rate of compound is > of current Fulcrum rate

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('0'), BNify('8733624454148471615')] // 0 ETH, 8.73362445415 ETH
    );

    const resGetParams = await this.token.getParamsForRedeemIdleToken.call(BNify('10').mul(this.one), false, {from: nonOwner});
    // Redeems 10 IdleETH
    // 10 IdleETH have been burned
    // there are no cETH in Idle contract
    // there are 8.733624454148471615 / 1.3 = 6.718172657037285857 iETH
    resGetParams[0][0].should.be.equal(this.cETHMock.address);
    resGetParams[0][1].should.be.equal(this.iETHMock.address);
    resGetParams[1][0].should.be.bignumber.equal(BNify('0'));
    resGetParams[1][1].should.be.bignumber.equal(BNify('8733624454148471614'));
  });
  it('redeems idle tokens and does not rebalances if paused', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.02 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%

    // First mint with tokenPrice = 1
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH for nonOwner,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // update prices
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1300000000000000000')); // 1.30ETH
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH

    // 250 * 0.025 = 6.25 ETH nav of cETH pool
    // so we transfer 1.25 ETH to cETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('1250000000000000000'), from: creator });
    // 4 * 1.3 = 5.2 ETH nav of iETH pool
    // so we transfer 1.2 ETH to iETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('1200000000000000000'), from: creator });
    // tokenPrice is now (6.25 + 5.2) / 10 = 1.145 ETH per idleETH

    // 11.45 total ETH nav + 10 ETH minted now
    // we set them all on Compound
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('21450000000000000000'), BNify('0').mul(this.one)] // 21.45 ETH, 0 ETH
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1.145 here
    await this.mintIdle(BNify('10').mul(this.one), someone);
    // so 10 / 1.145 IdleETH will be minted to nonOwner
    const resBalanceIdle2 = await this.token.balanceOf.call(someone, { from: someone });
    resBalanceIdle2.should.be.bignumber.equal(BNify('8733624454148471615')); // 8.73362445415
    // 21.45 / 0.025 = 858 cETH
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalance2.should.be.bignumber.equal(BNify('858').mul(this.oneCToken));
    // iETH pool is empty now
    const resBalanceIETH2 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH2.should.be.bignumber.equal(BNify('0').mul(this.one));

    // Pause contract
    await this.token.pause({from: creator});

    // Redeems 10 IdleETH
    const redeemedTokens = await this.token.redeemIdleToken.call(BNify('10').mul(this.one), false, [], {from: nonOwner});
    // it should be 100 + 11.45 - gas fees
    redeemedTokens.should.be.bignumber.equal(BNify('11450000000000000000')); // 11.45 ETH

    await this.token.redeemIdleToken(BNify('10').mul(this.one), false, [], {from: nonOwner});
    // so nonOwner has no IdleETH
    const resBalanceIdle3 = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle3.should.be.bignumber.equal(BNify('0').mul(this.one));
    // 10 IdleETH have been burned
    const resSupply = await this.token.totalSupply.call({ from: nonOwner });
    resSupply.should.be.bignumber.equal(BNify('8733624454148471615'));

    // iETH pool is still empty given that no rebalance happened
    const resBalanceIETH3 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH3.should.be.bignumber.equal(BNify('0').mul(this.one));

    // 11.45 ETH are given back to nonOwner
    const resBalanceETH3 = await web3.eth.getBalance(nonOwner);
    // 11.45 + 100 - gas fees + gains from prev tests
    resBalanceETH3.should.be.bignumber.equal(BNify('184805908840000000000'));

    // there are cETH in Idle contract
    const resBalance3 = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance3.should.be.bignumber.equal(BNify('400').mul(this.oneCToken));
  });
  it('redeems idle tokens and does not rebalances if paused', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.02 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%

    // First mint with tokenPrice = 1
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH for nonOwner,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // update prices
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1300000000000000000')); // 1.30ETH
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH

    // 250 * 0.025 = 6.25 ETH nav of cETH pool
    // so we transfer 1.25 ETH to cETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('1250000000000000000'), from: creator });
    // 4 * 1.3 = 5.2 ETH nav of iETH pool
    // so we transfer 1.2 ETH to iETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('1200000000000000000'), from: creator });
    // tokenPrice is now (6.25 + 5.2) / 10 = 1.145 ETH per idleETH

    // 11.45 total ETH nav + 10 ETH minted now
    // we set them all on Compound
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('21450000000000000000'), BNify('0').mul(this.one)] // 21.45 ETH, 0 ETH
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1.145 here
    await this.mintIdle(BNify('10').mul(this.one), someone);
    // so 10 / 1.145 IdleETH will be minted to nonOwner
    const resBalanceIdle2 = await this.token.balanceOf.call(someone, { from: someone });
    resBalanceIdle2.should.be.bignumber.equal(BNify('8733624454148471615')); // 8.73362445415
    // 21.45 / 0.025 = 858 cETH
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalance2.should.be.bignumber.equal(BNify('858').mul(this.oneCToken));
    // iETH pool is empty now
    const resBalanceIETH2 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH2.should.be.bignumber.equal(BNify('0').mul(this.one));

    // Lower iToken price
    await this.iETHMock.setPriceForTest(BNify('1000000000000000000')); // 1.0ETH

    // Redeems 10 IdleETH
    const redeemedTokens = await this.token.redeemIdleToken.call(BNify('10').mul(this.one), false, [], {from: nonOwner});
    redeemedTokens.should.be.bignumber.equal(BNify('11450000000000000000')); // 11.45 ETH

    await this.token.redeemIdleToken(BNify('10').mul(this.one), false, [], {from: nonOwner});
    // so nonOwner has no IdleETH
    const resBalanceIdle3 = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle3.should.be.bignumber.equal(BNify('0').mul(this.one));
    // 10 IdleETH have been burned
    const resSupply = await this.token.totalSupply.call({ from: nonOwner });
    resSupply.should.be.bignumber.equal(BNify('8733624454148471615'));

    // iETH pool is still empty given that no rebalance happened
    const resBalanceIETH3 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH3.should.be.bignumber.equal(BNify('0').mul(this.one));

    // 11.45 ETH are given back to nonOwner
    const resBalanceETH3 = await web3.eth.getBalance(nonOwner);
    // balance should be 100 + 11.45 - gas fees + every gain of prev tests
    resBalanceETH3.should.be.bignumber.equal(BNify('196247798480000000000'));

    // there are cETH in Idle contract
    const resBalance3 = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance3.should.be.bignumber.equal(BNify('400').mul(this.oneCToken));
  });
  it('redeems idle tokens and does not rebalances if _skipRebalance is true', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.02 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%

    // First mint with tokenPrice = 1
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH for nonOwner,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // update prices
    await this.cETHWrapper._setPriceInToken(BNify('250000000000000000000000000')); // 0.025
    await this.cETHMock._setExchangeRateStored(BNify('250000000000000000000000000')); // 0.025 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1300000000000000000')); // 1.30ETH
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH

    // 250 * 0.025 = 6.25 ETH nav of cETH pool
    // so we transfer 1.25 ETH to cETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.cETHMock.address, value: BNify('1250000000000000000'), from: creator });
    // 4 * 1.3 = 5.2 ETH nav of iETH pool
    // so we transfer 1.2 ETH to iETH mock to cover new interests earned
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('1200000000000000000'), from: creator });
    // tokenPrice is now (6.25 + 5.2) / 10 = 1.145 ETH per idleETH

    // 11.45 total ETH nav + 10 ETH minted now
    // we set them all on Compound
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('21450000000000000000'), BNify('0').mul(this.one)] // 21.45 ETH, 0 ETH
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1.145 here
    await this.mintIdle(BNify('10').mul(this.one), someone);
    // so 10 / 1.145 IdleETH will be minted to nonOwner
    const resBalanceIdle2 = await this.token.balanceOf.call(someone, { from: someone });
    resBalanceIdle2.should.be.bignumber.equal(BNify('8733624454148471615')); // 8.73362445415
    // 21.45 / 0.025 = 858 cETH
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalance2.should.be.bignumber.equal(BNify('858').mul(this.oneCToken));
    // iETH pool is empty now
    const resBalanceIETH2 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH2.should.be.bignumber.equal(BNify('0').mul(this.one));

    // Redeems 10 IdleETH
    const redeemedTokens = await this.token.redeemIdleToken.call(BNify('10').mul(this.one), true, [], {from: nonOwner});
    redeemedTokens.should.be.bignumber.equal(BNify('11450000000000000000')); // 11.45 ETH

    await this.token.redeemIdleToken(BNify('10').mul(this.one), true, [], {from: nonOwner});
    // so nonOwner has no IdleETH
    const resBalanceIdle3 = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle3.should.be.bignumber.equal(BNify('0').mul(this.one));
    // 10 IdleETH have been burned
    const resSupply = await this.token.totalSupply.call({ from: nonOwner });
    resSupply.should.be.bignumber.equal(BNify('8733624454148471615'));

    // iETH pool is still empty given that no rebalance happened
    const resBalanceIETH3 = await this.iETHMock.balanceOf.call(this.token.address, { from: someone });
    resBalanceIETH3.should.be.bignumber.equal(BNify('0').mul(this.one));

    // 11.45 ETH are given back to nonOwner
    const resBalanceETH3 = await web3.eth.getBalance(nonOwner);
    // balance should be 100 + 11.45 - gas fees + every gain of prev tests
    resBalanceETH3.should.be.bignumber.equal(BNify('207689686740000000000'));

    // there are cETH in Idle contract
    const resBalance3 = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance3.should.be.bignumber.equal(BNify('400').mul(this.oneCToken));
  });
  it('redeemInterestBearingTokens', async function () {
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.02
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.02 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    await this.iETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%

    // First mint with tokenPrice = 1
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );

    // Approve and Mint 10 ETH,
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    // so 10 IdleETH will be minted to nonOwner
    const resBalanceIdle = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle.should.be.bignumber.equal(BNify('10').mul(this.one));
    // half on Compound so 5 / 0.02 = 250 cETH in idle pool
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    // half on Fulcrum so 5 / 1.25 = 4 iETH in idle pool
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('4').mul(this.one));

    // used for rebalance at the end of the redeem method
    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('0').mul(this.one), BNify('0').mul(this.one)]
    );

    // Redeems 10 IdleETH
    await this.token.redeemInterestBearingTokens(BNify('10').mul(this.one), {from: nonOwner});
    // so nonOwner has no IdleETH
    const resBalanceIdle2 = await this.token.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIdle2.should.be.bignumber.equal(BNify('0').mul(this.one));
    // IdleETH have been burned
    const resSupply = await this.token.totalSupply.call({ from: nonOwner });
    resSupply.should.be.bignumber.equal(BNify('0').mul(this.one));
    // there are no cETH in Idle contract
    const resBalance2 = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance2.should.be.bignumber.equal(BNify('0').mul(this.oneCToken));
    // there are no iETH in Idle contract
    const resBalanceIETH2 = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH2.should.be.bignumber.equal(BNify('0').mul(this.one));

    // interest bearing assets are given directly to the user without redeeming the underlying ETH
    const resBalanceCETHOwner = await this.cETHMock.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceCETHOwner.should.be.bignumber.equal(BNify('250').mul(this.oneCToken));
    const resBalanceIETHOwner = await this.iETHMock.balanceOf.call(nonOwner, { from: nonOwner });
    resBalanceIETHOwner.should.be.bignumber.equal(BNify('4').mul(this.one));
  });
  it('claimITokens and rebalances', async function () {
    await this.iETHMock.setToTransfer(BNify('2').mul(this.one), {from: creator});
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('2').mul(this.one), from: creator });

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 1.1%

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('0'), BNify('0')]
    );

    const res = await this.token.claimITokens.call([], {from: creator});
    res.should.be.bignumber.equal(BNify('2').mul(this.one));

    await this.token.claimITokens([], {from: creator});
  });
  it('cannot claimITokens if iToken price has decreased', async function () {
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%

    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    await this.iETHMock.setPriceForTest(BNify('1000000000000000000')); // 1.0ETH

    await expectRevert(
      this.token.claimITokens([], {from: creator}),
      'Paused: iToken price decreased'
    );
  });
  it('can claimITokens if iToken price has decreased and contract has been manually played', async function () {
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    await this.iETHMock.setPriceForTest(BNify('1000000000000000000')); // 1.0ETH

    await this.iETHMock.setToTransfer(BNify('2').mul(this.one), {from: creator});
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('2').mul(this.one), from: creator });
    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('0'), BNify('0')]
    );

    await this.token.setManualPlay(true, { from: creator });
    await this.token.claimITokens([], {from: creator});
  });
  it('after claimITokens lastITokenPrice is updated if it has increased', async function () {
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%

    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    await this.iETHMock.setPriceForTest(BNify('1500000000000000000')); // 1.0ETH

    await this.iETHMock.setToTransfer(BNify('2').mul(this.one), {from: creator});
    await web3.eth.sendTransaction({to: this.iETHMock.address, value: BNify('2').mul(this.one), from: creator });

    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.1%

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('0'), BNify('0')]
    );

    const res = await this.token.claimITokens.call([], {from: creator});
    res.should.be.bignumber.equal(BNify('2').mul(this.one));

    await this.token.setManualPlay(true, { from: creator });
    await this.token.claimITokens([], {from: creator});
    const price = await this.token.lastITokenPrice.call();
    price.should.be.bignumber.equal(BNify('1500000000000000000'));
  });
  it('cannot rebalance when paused', async function () {
    await this.token.pause({from: creator});
    await expectRevert.unspecified(this.token.rebalance([], {value: BNify('0').mul(this.one), from: nonOwner }));
  });
  it('does not rebalances when _newAmount == 0 and no currentTokensUsed', async function () {
    // Initially when no one has minted `currentTokensUsed` is empty
    // so _rebalanceCheck would return true
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%

    const res = await this.token.rebalance.call([], {value: BNify('0').mul(this.one), from: creator });
    res.should.be.equal(false);
    await this.token.rebalance([], {value: BNify('0').mul(this.one), from: creator });
  });
  it('cannot rebalance if iToken price has decreased', async function () {
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    await this.iETHMock.setPriceForTest(BNify('1000000000000000000')); // 1.0ETH
    await expectRevert(
      this.token.rebalance([], {value: BNify('0').mul(this.one), from: creator }),
      'Paused: iToken price decreased'
    );
  });
  it('can rebalance if iToken price has decreased and contract has been manually played', async function () {
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    await this.iETHMock.setPriceForTest(BNify('1000000000000000000')); // 1.0ETH
    await this.token.setManualPlay(true, { from: creator });
    await this.token.rebalance([], {value: BNify('0').mul(this.one), from: creator });
  });
  it('after rebalance lastITokenPrice is updated if it increased', async function () {
    await this.iETHMock.setPriceForTest(BNify('1300000000000000000')); // 1.30ETH
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);
    const price = await this.token.lastITokenPrice.call();
    price.should.be.bignumber.equal(BNify('1300000000000000000'));

    await this.iETHMock.setPriceForTest(BNify('1500000000000000000')); // 1.30ETH
    await this.token.rebalance([], {value: BNify('0').mul(this.one), from: creator });
    const price2 = await this.token.lastITokenPrice.call();
    price2.should.be.bignumber.equal(BNify('1500000000000000000'));
  });
  it('rebalances when _newAmount > 0 and only one protocol is used', async function () {
    // Initially when no one has minted `currentTokensUsed` is empty
    // so _rebalanceCheck would return true

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('1200000000000000000')); // 1.2%

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('10').mul(this.one), BNify('0').mul(this.one)]
    );

    // Approve and Mint 10 ETH for nonOwner, everything on Compound
    // tokenPrice is 1 here
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);

    // Prepare fake data for rebalanceCheck
    await this.cETHWrapper._setNextSupplyRate(BNify('2000000000000000000')); // 2.0%
    // everything will go to Compound because next supply rate of compound is > of current Fulcrum rate
    // so _rebalanceCheck would return true

    await web3.eth.sendTransaction({to: this.token.address, value: BNify('10').mul(this.one), from: creator });

    const res = await this.token.rebalance.call([], {value: BNify('10').mul(this.one), from: creator });
    res.should.be.equal(false);
    // it should mint 10 / 0.02 = 500cETH
    // plus 500 cETH from before
    const receipt = await this.token.rebalance([], {value: BNify('10').mul(this.one), from: creator });

    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('1000').mul(this.oneCToken));

    const resFirstToken = await this.token.currentTokensUsed.call(0);
    resFirstToken.should.be.equal(this.cETHMock.address);

    // there is only one token (invalid opcode)
    await expectRevert.assertion(this.token.currentTokensUsed(1));
  });
  it('rebalances and multiple protocols are used', async function () {
    // update prices
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.025
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.025 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25 ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25 ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );
    // Approve and Mint 10 ETH for nonOwner
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('2').mul(this.one), BNify('8').mul(this.one)]
    );

    const res = await this.token.rebalance.call([], {value: BNify('10').mul(this.one), from: creator });
    res.should.be.equal(true);
    await this.token.rebalance([], {value: BNify('10').mul(this.one), from: creator });

    // IdleToken should have 2 / 0.02 = 100cETH
    const resBalance = await this.cETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalance.should.be.bignumber.equal(BNify('100').mul(this.oneCToken));
    // IdleToken should have 8 / 1.25 = 6.4 iETH
    const resBalanceIETH = await this.iETHMock.balanceOf.call(this.token.address, { from: nonOwner });
    resBalanceIETH.should.be.bignumber.equal(BNify('6400000000000000000'));

    const resFirstToken = await this.token.currentTokensUsed.call(0);
    resFirstToken.should.be.equal(this.cETHMock.address);
    const resSecondToken = await this.token.currentTokensUsed.call(1);
    resSecondToken.should.be.equal(this.iETHMock.address);

    // there is only 2 tokens (invalid opcode)
    await expectRevert.assertion(this.token.currentTokensUsed(2));
  });
  it('getParamsForRebalance', async function () {
    // update prices
    await this.cETHWrapper._setPriceInToken(BNify('200000000000000000000000000')); // 0.025
    await this.cETHMock._setExchangeRateStored(BNify('200000000000000000000000000')); // 0.025 ETH
    await this.iETHWrapper._setPriceInToken(BNify('1250000000000000000')); // 1.25 ETH
    await this.iETHMock.setPriceForTest(BNify('1250000000000000000')); // 1.25 ETH

    // set same rates so to use _calcAmounts from IdleRebalancer
    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('5').mul(this.one), BNify('5').mul(this.one)]
    );
    // Approve and Mint 10 ETH for nonOwner
    await this.mintIdle(BNify('10').mul(this.one), nonOwner);

    await this.IdleRebalancer._setCalcAmounts(
      [this.cETHMock.address, this.iETHMock.address],
      [BNify('2').mul(this.one), BNify('8').mul(this.one)]
    );

    const resGetParams = await this.token.getParamsForRebalance.call({value: BNify('10').mul(this.one), from: nonOwner});
      resGetParams[0][0].should.be.equal(this.cETHMock.address);
      resGetParams[0][1].should.be.equal(this.iETHMock.address);

      resGetParams[1][0].should.be.bignumber.equal(BNify('2').mul(this.one));
      resGetParams[1][1].should.be.bignumber.equal(BNify('8').mul(this.one));
  });

  // ###################### _rebalanceCheck tests #################################
  it('_rebalanceCheck when no currentToken is given and the best protocol cannot sustain all the liquidity provided', async function () {
    await this.IdleRebalancer.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});

    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2000000000000000000')); // 2.0%
    await this.cETHWrapper._setNextSupplyRate(BNify('1500000000000000000')); // 1.5%

    const res = await this.fakeToken._rebalanceCheck.call(BNify('10').mul(this.one), "0x0000000000000000000000000000000000000000", { from: creator });

    res[0].should.be.equal(true);
    res[1].should.be.equal(this.cETHMock.address);
  });
  it('_rebalanceCheck when no currentToken is given and the best protocol can sustain all the liquidity provided', async function () {
    await this.IdleRebalancer.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});

    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2000000000000000000')); // 2.0%
    await this.cETHWrapper._setNextSupplyRate(BNify('2100000000000000000')); // 2.1%

    const res = await this.fakeToken._rebalanceCheck.call(BNify('10').mul(this.one), "0x0000000000000000000000000000000000000000", { from: creator });

    res[0].should.be.equal(false);
    res[1].should.be.equal(this.cETHMock.address);
  });
  it('_rebalanceCheck when no currentToken is given and the best protocol cannot sustain all the liquidity but the new rate is within a minRateDifference', async function () {
    await this.IdleRebalancer.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});

    await this.cETHWrapper._setAPR(BNify('2200000000000000000')); // 2.2%
    await this.iETHWrapper._setAPR(BNify('2000000000000000000')); // 2.0%
    await this.cETHWrapper._setNextSupplyRate(BNify('1900000000000000000')); // 1.9%

    const res = await this.fakeToken._rebalanceCheck.call(BNify('10').mul(this.one), "0x0000000000000000000000000000000000000000", { from: creator });

    res[0].should.be.equal(false);
    res[1].should.be.equal(this.cETHMock.address);
  });
  it('_rebalanceCheck when currentToken is given and curr protocol has not the best rate', async function () {
    await this.IdleRebalancer.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});

    await this.iETHWrapper._setAPR(BNify('2000000000000000000')); // 2%
    await this.cETHWrapper._setAPR(BNify('1000000000000000000')); // 1%

    const res = await this.fakeToken._rebalanceCheck.call(
      BNify('10').mul(this.one),
      this.cETHMock.address, // currentProtocol
      { from: creator }
    );
    res[0].should.be.equal(true);
    res[1].should.be.equal(this.iETHMock.address);
  });
  it('_rebalanceCheck when currentToken is given and curr protocol has the best rate (even with _newAmount)', async function () {
    await this.IdleRebalancer.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});

    await this.cETHWrapper._setAPR(BNify('2000000000000000000')); // 2%
    await this.iETHWrapper._setAPR(BNify('1000000000000000000')); // 1%
    await this.cETHWrapper._setNextSupplyRate(BNify('1900000000000000000')); // 1.9%

    const res = await this.fakeToken._rebalanceCheck.call(
      BNify('10').mul(this.one),
      this.cETHMock.address,
      { from: creator }
    );

    res[0].should.be.equal(false);
    res[1].should.be.equal(this.cETHMock.address);
  });
  it('_rebalanceCheck when currentToken is given and curr protocol has not the best rate but is within a minRateDifference', async function () {
    await this.IdleRebalancer.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.cETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});
    await this.iETHWrapper.setIdleToken(this.idleFakeTokenAddr, {from: creator});

    await this.cETHWrapper._setAPR(BNify('2000000000000000000')); // 2%
    await this.iETHWrapper._setAPR(BNify('1900000000000000000')); // 1.9%
    await this.cETHWrapper._setNextSupplyRate(BNify('1800000000000000000')); // 1.8%
    // minRateDifference is 0.1%

    const res = await this.fakeToken._rebalanceCheck.call(
      BNify('10').mul(this.one),
      this.cETHMock.address,
      { from: creator }
    );

    res[0].should.be.equal(false);
    res[1].should.be.equal(this.cETHMock.address);
  });
  // other internal methods have been "indirectly" tested through tests of other public methods
});
