const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const IdleETHFulcrum = artifacts.require('IdleETHFulcrum');
const iETHMock = artifacts.require('iETHMock');
const BNify = n => new BN(String(n));

contract('IdleETHFulcrum', function ([_, creator, nonOwner, someone, foo]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';

    this.iETHMock = await iETHMock.new(creator, {from: creator});
    this.iETHWrapper = await IdleETHFulcrum.new(
      this.iETHMock.address,
      {from: creator}
    );
    await this.iETHWrapper.setIdleToken(nonOwner, {from: creator});
  });

  it('constructor set a token address', async function () {
    (await this.iETHWrapper.token()).should.equal(this.iETHMock.address);
  });
  it('allows onlyOwner to setIdleToken', async function () {
    const val = this.someAddr;
    // it will revert with reason `idleToken addr already set` because it has already been set in beforeEach
    await expectRevert(
      this.iETHWrapper.setIdleToken(val, { from: creator }),
      'idleToken addr already set'
    );

    // it will revert with unspecified reason for nonOwner
    await expectRevert.unspecified(this.iETHWrapper.setIdleToken(val, { from: nonOwner }));
  });
  it('returns next supply rate given amount', async function () {
    const val = BNify(10**18);
    const res = await this.iETHWrapper.nextSupplyRate.call(val, { from: nonOwner });

    const nextSupplyInterestRateFulcrum = await this.iETHMock.nextSupplyInterestRate.call(val);
    const expectedRes = BNify(nextSupplyInterestRateFulcrum);
    res.should.be.bignumber.equal(expectedRes);
  });
  it('returns next supply rate given params', async function () {
    // tested with data and formula from task iETH:manualNextRateData
    const val = [
      BNify("16089452222034747442"), // a, protocolInterestRate
      BNify("419766782897339371903563"), // b, totalAssetBorrow
      BNify("995495112439158951883651"), // s, totalAssetSupply
      BNify(10**23) //  x, _amount
    ];
    const res = await this.iETHWrapper.nextSupplyRateWithParams.call(val, { from: nonOwner });
    // a * b * s / ((s + x) * (s + x))
    const expectedRes2 = val[0].mul(val[1]).mul(val[2]).div((val[2].add(val[3]).mul(val[2].add(val[3]))));
    res.should.not.be.bignumber.equal(BNify(0));
    res.should.be.bignumber.equal(expectedRes2);
  });
  it('getPriceInToken returns iToken price', async function () {
    const res = await this.iETHWrapper.getPriceInToken.call({ from: nonOwner });
    const expectedRes = BNify(await this.iETHMock.tokenPrice.call());
    res.should.be.bignumber.equal(expectedRes);
    res.should.be.bignumber.equal('1100000000000000000');
  });
  it('getAPR returns current yearly rate (counting fee ie spreadMultiplier)', async function () {
    const res = await this.iETHWrapper.getAPR.call({ from: nonOwner });

    const currSupplyInterestRateFulcrum = await this.iETHMock.supplyInterestRate.call();
    const spreadMultiplier = await this.iETHMock.spreadMultiplier.call();
    const expectedRes = BNify(currSupplyInterestRateFulcrum);
    res.should.be.bignumber.equal(expectedRes);
  });
  it('mint returns 0 if no tokens are presenti in this contract', async function () {
    const res = await this.iETHWrapper.mint.call({ from: nonOwner });
    res.should.be.bignumber.equal(BNify(0));
  });
  it('mint creates iTokens and it sends them to msg.sender', async function () {
    // deposit 10 ETH in iETHWrapper
    await web3.eth.sendTransaction({to: this.iETHWrapper.address, from: creator, value: BNify('10').mul(this.one)});
    // mints in Fulcrum with 10 ETH
    const callRes = await this.iETHWrapper.mint.call({ from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('9090909090909090909'));
    // do the effective tx
    await this.iETHWrapper.mint({ from: nonOwner });
    (await this.iETHMock.balanceOf(nonOwner)).should.be.bignumber.equal(BNify('9090909090909090909'));
  });
  it('redeem creates iTokens and it sends them to msg.sender', async function () {
    // fund iETHMock with 11 ETH
    await web3.eth.sendTransaction({to: this.iETHMock.address, from: creator, value: BNify('11').mul(this.one)});
    // deposit 100 iETH in iETHWrapper
    await this.iETHMock.transfer(this.iETHWrapper.address, BNify('10').mul(this.one), {from: creator});
    // redeem in Fulcrum with 10 iETH * 1.1 (price) = 11 ETH
    const callRes = await this.iETHWrapper.redeem.call(nonOwner, { from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('11').mul(this.one));
    // do the effective tx
    await this.iETHWrapper.redeem(nonOwner, { from: nonOwner });

    // It should be 100 (base amount) + 11 - some gas fee
    // (await web3.eth.getBalance(nonOwner)).should.be.bignumber.equal(BNify('111').mul(this.one));
    (await web3.eth.getBalance(nonOwner)).should.be.bignumber.equal(BNify('110997629180000000000'));
  });
  it('redeem reverts if not all amount is available', async function () {
    // fund iETHMock with only 10 ETH (not enough to redeem everything)
    await web3.eth.sendTransaction({to: this.iETHMock.address, from: creator, value: BNify('10').mul(this.one)});
    // deposit 100 iETH in iETHWrapper
    await this.iETHMock.transfer(this.iETHWrapper.address, BNify('100').mul(this.one), {from: creator});
    // redeem in Fulcrum with 100 iETH * 1.1 (price) = 110 ETH
    // not all ETH are present
    await this.iETHMock.setFakeBurn({ from: nonOwner });

    await expectRevert(
      this.iETHWrapper.redeem(nonOwner, { from: nonOwner }),
      'Not enough liquidity on Fulcrum'
    );
  });
});
