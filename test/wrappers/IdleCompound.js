const { expectEvent, singletons, constants, BN, expectRevert } = require('openzeppelin-test-helpers');

const IdleCompound = artifacts.require('IdleCompound');
const WhitePaperMock = artifacts.require('WhitePaperMock');
const cDAIMock = artifacts.require('cDAIMock');
const DAIMock = artifacts.require('DAIMock');
const BNify = n => new BN(String(n));

contract('IdleCompound', function ([_, creator, nonOwner, someone, foo]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.oneCToken = new BN('100000000'); // 8 decimals
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';

    this.DAIMock = await DAIMock.new({from: creator});
    this.WhitePaperMock = await WhitePaperMock.new({from: creator});
    this.cDAIMock = await cDAIMock.new(this.DAIMock.address, creator, this.WhitePaperMock.address, {from: creator});

    this.cDAIWrapper = await IdleCompound.new(
      this.cDAIMock.address,
      this.DAIMock.address,
      {from: creator}
    );
  });

  it('constructor set a token address', async function () {
    (await this.cDAIWrapper.token()).should.equal(this.cDAIMock.address);
  });
  it('constructor set an underlying address', async function () {
    (await this.cDAIWrapper.underlying()).should.equal(this.DAIMock.address);
  });
  it('allows onlyOwner to setToken', async function () {
    const val = this.someAddr;
    await this.cDAIWrapper.setToken(val, { from: creator });
    (await this.cDAIWrapper.token()).should.equal(val);

    await expectRevert.unspecified(this.cDAIWrapper.setToken(val, { from: nonOwner }));
  });
  it('allows onlyOwner to setUnderlying', async function () {
    const val = this.someAddr;
    await this.cDAIWrapper.setUnderlying(val, { from: creator });
    (await this.cDAIWrapper.underlying()).should.equal(val);

    await expectRevert.unspecified(this.cDAIWrapper.setUnderlying(val, { from: nonOwner }));
  });
  it('returns next supply rate given amount', async function () {
    const val = [];
    val[0] = BNify('1000000000000000000'), // 10 ** 18;
    val[1] = BNify('50000000000000000'), // white.baseRate();
    val[2] = BNify('23235999897534012338929659'), // cToken.totalBorrows();
    val[3] = BNify('120000000000000000'), // white.multiplier();
    val[4] = BNify('107742405685625342683992'), // cToken.totalReserves();
    val[5] = BNify('950000000000000000'), // j.sub(cToken.reserveFactorMantissa());
    val[6] = BNify('11945633145364637018215366'), // cToken.getCash();
    val[7] = BNify('2102400'), // cToken.blocksInAYear();
    val[8] = BNify('100'), // 100;
    val[9] = BNify('10000000000000000000000') // 10**22 -> 10000 DAI newAmountSupplied;

    // set mock data in cDAIMock
    await this.cDAIMock.setParams(val);

    const nextSupplyInterestRateCompound = await this.cDAIWrapper.nextSupplyRate.call(val[9]);

    // rename params for compound formula
    const j = val[0]; // 10 ** 18;
    const a = val[1]; // white.baseRate(); // from WhitePaper
    const b = val[2]; // cToken.totalBorrows();
    const c = val[3]; // white.multiplier(); // from WhitePaper
    const d = val[4]; // cToken.totalReserves();
    const e = val[5]; // j.sub(cToken.reserveFactorMantissa());
    const s = val[6]; // cToken.getCash();
    const k = val[7]; // cToken.blocksInAYear();
    const f = val[8]; // 100;
    const x = val[9]; // newAmountSupplied;

    // q = ((((a + (b*c)/(b + s + x)) / k) * e * b / (s + x + b - d)) / j) * k * f -> to get yearly rate
    const expectedRes = a.add(b.mul(c).div(b.add(s).add(x))).div(k).mul(e).mul(b).div(
      s.add(x).add(b).sub(d)
    ).div(j).mul(k).mul(f); // to get the yearly rate

    nextSupplyInterestRateCompound.should.not.be.bignumber.equal(BNify('0'));
    nextSupplyInterestRateCompound.should.be.bignumber.equal(expectedRes);
  });
  it('returns next supply rate given params (counting fee)', async function () {
    // tested with data and formula from task idleDAI:rebalanceCalc -> targetSupplyRateWithFeeCompound
    const val = [];
    val[0] = BNify('1000000000000000000'), // 10 ** 18;
    val[1] = BNify('50000000000000000'), // white.baseRate();
    val[2] = BNify('23235999897534012338929659'), // cToken.totalBorrows();
    val[3] = BNify('120000000000000000'), // white.multiplier();
    val[4] = BNify('107742405685625342683992'), // cToken.totalReserves();
    val[5] = BNify('950000000000000000'), // j.sub(cToken.reserveFactorMantissa());
    val[6] = BNify('11945633145364637018215366'), // cToken.getCash();
    val[7] = BNify('2102400'), // cToken.blocksInAYear();
    val[8] = BNify('100'), // 100;
    val[9] = BNify('10000000000000000000000') // 10**22 -> 10000 DAI newAmountSupplied;

    const res = await this.cDAIWrapper.nextSupplyRateWithParams.call(val, { from: nonOwner });

    const j = val[0]; // 10 ** 18;
    const a = val[1]; // white.baseRate(); // from WhitePaper
    const b = val[2]; // cToken.totalBorrows();
    const c = val[3]; // white.multiplier(); // from WhitePaper
    const d = val[4]; // cToken.totalReserves();
    const e = val[5]; // j.sub(cToken.reserveFactorMantissa());
    const s = val[6]; // cToken.getCash();
    const k = val[7]; // cToken.blocksInAYear();
    const f = val[8]; // 100;
    const x = val[9]; // newAmountSupplied;

    // q = ((((a + (b*c)/(b + s + x)) / k) * e * b / (s + x + b - d)) / j) * k * f -> to get yearly rate
    const expectedRes = a.add(b.mul(c).div(b.add(s).add(x))).div(k).mul(e).mul(b).div(
      s.add(x).add(b).sub(d)
    ).div(j).mul(k).mul(f); // to get the yearly rate

    res.should.not.be.bignumber.equal(BNify('0'));
    res.should.be.bignumber.equal(expectedRes);
  });
  it('getPriceInToken returns cToken price', async function () {
    const res = await this.cDAIWrapper.getPriceInToken.call({ from: nonOwner });
    const expectedRes = BNify(await this.cDAIMock.exchangeRateStored.call());
    res.should.be.bignumber.equal(expectedRes);
    res.should.be.bignumber.equal('200000000000000000000000000');
  });
  it('getAPR returns current yearly rate (counting fee)', async function () {
    const res = await this.cDAIWrapper.getAPR.call({ from: nonOwner });

    const rate = await this.cDAIMock.supplyRatePerBlock.call();
    const blocksInAYear = await this.cDAIMock.blocksInAYear.call();
    const expectedRes = BNify(rate).mul(BNify(blocksInAYear)).mul(BNify('100'));
    res.should.not.be.bignumber.equal(BNify('0'));
    res.should.be.bignumber.equal(expectedRes);
  });
  it('mint returns 0 if no tokens are presenti in this contract', async function () {
    const res = await this.cDAIWrapper.mint.call({ from: nonOwner });
    res.should.be.bignumber.equal(BNify('0'));
  });
  it('mint creates cTokens and it sends them to msg.sender', async function () {
    // deposit 100 DAI in cDAIWrapper
    await this.DAIMock.transfer(this.cDAIWrapper.address, BNify('100').mul(this.one), {from: creator});
    // mints in Compound with 100 DAI
    const callRes = await this.cDAIWrapper.mint.call({ from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('500000000000'));
    // do the effective tx
    await this.cDAIWrapper.mint({ from: nonOwner });
    (await this.cDAIMock.balanceOf(nonOwner)).should.be.bignumber.equal(BNify('500000000000'));
  });
  it('redeem creates cTokens and it sends them to msg.sender', async function () {
    // fund cDAIMock with 100 DAI
    await this.DAIMock.transfer(this.cDAIMock.address, BNify('100').mul(this.one), {from: creator});
    // deposit 5000 cDAI in cDAIWrapper
    await this.cDAIMock.transfer(this.cDAIWrapper.address, BNify('5000').mul(this.oneCToken), {from: creator});
    // redeem in Compound with 5000 cDAI * 0.02 (price) = 100 DAI
    const callRes = await this.cDAIWrapper.redeem.call(nonOwner, { from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('100').mul(this.one));
    // do the effective tx
    await this.cDAIWrapper.redeem(nonOwner, { from: nonOwner });
    (await this.DAIMock.balanceOf(nonOwner)).should.be.bignumber.equal(BNify('100').mul(this.one));
  });
});
