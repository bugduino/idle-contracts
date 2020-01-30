pragma solidity 0.5.11;

// interfaces
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/iERC20Fulcrum.sol";

contract iETHMock is ERC20Detailed, ERC20, iERC20Fulcrum {
  using Address for address payable;

  bool public isUsingFakeBurn;
  uint256 public exchangeRate;
  uint256 public toTransfer;
  uint256 public supplyRate;
  uint256 public price;
  uint256 public spreadMultiplier;

  uint256 public _avgBorrowRate;
  uint256 public _totalAssetBorrow;
  uint256 public _totalAssetSupply;

  constructor(address _someone)
    ERC20()
    ERC20Detailed('iETH', 'iETH', 18) public {
    isUsingFakeBurn = false;
    toTransfer = 10**18;
    supplyRate = 3000000000000000000; // 3%
    price = 1100000000000000000; // 1.1 ETH
    spreadMultiplier = 90000000000000000000; // 90%
    _mint(address(this), 10000 * 10**18); // 10.000 iETH
    _mint(_someone, 10000 * 10**18); // 10.000 iETH
  }

  function mint(address receiver, uint256 amount) external returns (uint256) {
  }
  function burn(address receiver, uint256 amount) external returns (uint256) {
  }
  function mintWithEther(address receiver) external payable returns (uint256) {
    _mint(receiver, (msg.value * 10**18)/price);
    return (msg.value * 10**18)/price;
  }
  function burnToEther(address payable receiver, uint256 amount) external returns (uint256) {
    if (isUsingFakeBurn) {
      return 1000000000000000000; // 10 ETH
    }
    _burn(msg.sender, amount);
    receiver.sendValue(amount * price / 10**18);
    return amount * price / 10**18;
  }

  function claimLoanToken() external returns (uint256)  {
    msg.sender.sendValue(toTransfer);
    return toTransfer;
  }
  function setParams(uint256[] memory params) public {
    _avgBorrowRate = params[0];
    _totalAssetBorrow = params[1];
    _totalAssetSupply = params[2];
  }
  function setFakeBurn() public {
    isUsingFakeBurn = true;
  }
  function tokenPrice() external view returns (uint256)  {
    return price;
  }
  function supplyInterestRate() external view returns (uint256)  {
    return supplyRate;
  }
  function setSupplyInterestRateForTest(uint256 _rate) external {
    supplyRate = _rate;
  }
  function setPriceForTest(uint256 _price) external {
    price = _price;
  }
  function setSpreadMultiplierForTest(uint256 _spreadMultiplier) external {
    spreadMultiplier = _spreadMultiplier;
  }
  function setToTransfer(uint256 _toTransfer) external {
    toTransfer = _toTransfer;
  }
  function rateMultiplier()
    external
    view
    returns (uint256) {}
  function baseRate()
    external
    view
    returns (uint256) {}

  function borrowInterestRate()
    external
    view
    returns (uint256) {}

  function avgBorrowInterestRate()
    external
    view
    returns (uint256) {
    return _avgBorrowRate;
  }
  function protocolInterestRate()
    external
    view
    returns (uint256) {
    return _avgBorrowRate;
  }

  function totalAssetBorrow()
    external
    view
    returns (uint256) {
      return _totalAssetBorrow;
  }

  function totalAssetSupply()
    external
    view
    returns (uint256) {
    return _totalAssetSupply;
  }

  function nextSupplyInterestRate(uint256)
    external
    view
    returns (uint256) {
      return supplyRate;
  }

  function nextBorrowInterestRate(uint256)
    external
    view
    returns (uint256) {}
  function nextLoanInterestRate(uint256)
    external
    view
    returns (uint256) {}

  function dsr()
    external
    view
    returns (uint256) {}

  function chaiPrice()
    external
    view
    returns (uint256) {}

  function() external payable {}
}
