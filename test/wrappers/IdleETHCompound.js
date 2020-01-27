const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const IdleETHCompound = artifacts.require('IdleETHCompound');
const WhitePaperMock = artifacts.require('WhitePaperMock');
const cETHMock = artifacts.require('cETHMock');
const BNify = n => new BN(String(n));

contract('IdleETHCompound', function ([_, creator, nonOwner, someone, foo]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.oneCToken = new BN('100000000'); // 8 decimals
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';

    this.WhitePaperMock = await WhitePaperMock.new({from: creator});
    this.cETHMock = await cETHMock.new(creator, this.WhitePaperMock.address, {from: creator});

    this.cETHWrapper = await IdleETHCompound.new(
      this.cETHMock.address,
      {from: creator}
    );
    await this.cETHWrapper.setIdleToken(nonOwner, {from: creator});
  });

  it('constructor set a token address', async function () {
    (await this.cETHWrapper.token()).should.equal(this.cETHMock.address);
  });
  it('allows onlyOwner to setIdleToken', async function () {
    const val = this.someAddr;
    // it will revert with reason `idleToken addr already set` because it has already been set in beforeEach
    await expectRevert(
      this.cETHWrapper.setIdleToken(val, { from: creator }),
      'idleToken addr already set'
    );

    // it will revert with unspecified reason for nonOwner
    await expectRevert.unspecified(this.cETHWrapper.setIdleToken(val, { from: nonOwner }));
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
    val[7] = BNify('2102400'), // cToken.blocksPerYear();
    val[8] = BNify('100'), // 100;
    val[9] = BNify('10000000000000000000000') // 10**22 -> 10000 ETH newAmountSupplied;

    // set mock data in cETHMock
    await this.cETHMock.setParams(val);

    const nextSupplyInterestRateCompound = await this.cETHWrapper.nextSupplyRate.call(val[9]);

    // rename params for compound formula
    const j = val[0]; // 10 ** 18;
    const a = val[1]; // white.baseRate(); // from WhitePaper
    const b = val[2]; // cToken.totalBorrows();
    const c = val[3]; // white.multiplier(); // from WhitePaper
    const d = val[4]; // cToken.totalReserves();
    const e = val[5]; // j.sub(cToken.reserveFactorMantissa());
    const s = val[6]; // cToken.getCash();
    const k = val[7]; // cToken.blocksPerYear();
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
    // tested with data and formula from task idleETH:rebalanceCalc -> targetSupplyRateWithFeeCompound
    const val = [];
    val[0] = BNify('1000000000000000000'), // 10 ** 18;
    val[1] = BNify('50000000000000000'), // white.baseRate();
    val[2] = BNify('23235999897534012338929659'), // cToken.totalBorrows();
    val[3] = BNify('120000000000000000'), // white.multiplier();
    val[4] = BNify('107742405685625342683992'), // cToken.totalReserves();
    val[5] = BNify('950000000000000000'), // j.sub(cToken.reserveFactorMantissa());
    val[6] = BNify('11945633145364637018215366'), // cToken.getCash();
    val[7] = BNify('2102400'), // cToken.blocksPerYear();
    val[8] = BNify('100'), // 100;
    val[9] = BNify('10000000000000000000000') // 10**22 -> 10000 ETH newAmountSupplied;

    const res = await this.cETHWrapper.nextSupplyRateWithParams.call(val, { from: nonOwner });

    const j = val[0]; // 10 ** 18;
    const a = val[1]; // white.baseRate(); // from WhitePaper
    const b = val[2]; // cToken.totalBorrows();
    const c = val[3]; // white.multiplier(); // from WhitePaper
    const d = val[4]; // cToken.totalReserves();
    const e = val[5]; // j.sub(cToken.reserveFactorMantissa());
    const s = val[6]; // cToken.getCash();
    const k = val[7]; // cToken.blocksPerYear();
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
    const res = await this.cETHWrapper.getPriceInToken.call({ from: nonOwner });
    const expectedRes = BNify(await this.cETHMock.exchangeRateStored.call());
    res.should.be.bignumber.equal(expectedRes);
    res.should.be.bignumber.equal('200000000000000000000000000');
  });
  it('getAPR returns current yearly rate (counting fee)', async function () {
    const res = await this.cETHWrapper.getAPR.call({ from: nonOwner });

    const rate = await this.cETHMock.supplyRatePerBlock.call();
    const blocksPerYear = await this.WhitePaperMock.blocksPerYear.call();
    const expectedRes = BNify(rate).mul(BNify(blocksPerYear)).mul(BNify('100'));
    res.should.not.be.bignumber.equal(BNify('0'));
    res.should.be.bignumber.equal(expectedRes);
  });
  it('mint returns 0 if no tokens are present in this contract', async function () {
    const res = await this.cETHWrapper.mint.call({ from: nonOwner });
    res.should.be.bignumber.equal(BNify('0'));
  });
  it('mint creates cTokens and it sends them to msg.sender', async function () {
    // deposit 10 ETH in cETHWrapper
    await web3.eth.sendTransaction({to: this.cETHWrapper.address, from: creator, value: BNify('10').mul(this.one)});

    // mints in Compound with 10 ETH
    const callRes = await this.cETHWrapper.mint.call({from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('50000000000'));
    // do the effective tx
    await this.cETHWrapper.mint({ from: nonOwner });

    // get ETH balance
    (await this.cETHMock.balanceOf(nonOwner)).should.be.bignumber.equal(BNify('50000000000'));
  });
  it('redeem creates cTokens and it sends them to msg.sender', async function () {
    // fund cETHMock with 10 ETH
    await web3.eth.sendTransaction({to: this.cETHMock.address, from: creator, value: BNify('10').mul(this.one)});
    // deposit 500 cETH in cETHWrapper
    await this.cETHMock.transfer(this.cETHWrapper.address, BNify('500').mul(this.oneCToken), {from: creator});
    // redeem in Compound with 500 cETH * 0.02 (price) = 10 ETH
    const callRes = await this.cETHWrapper.redeem.call(nonOwner, { from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('10').mul(this.one));
    // do the effective tx
    await this.cETHWrapper.redeem(nonOwner, { from: nonOwner });

    // 100 ETH was the starting point so total should be 110ETH minus some gas fee for the previou txs (mint, redeem)
    // (await web3.eth.getBalance(nonOwner)).should.be.bignumber.equal(BNify('110').mul(this.one));
    (await web3.eth.getBalance(nonOwner)).should.be.bignumber.equal(BNify('109997170200000000000'));
  });
});
