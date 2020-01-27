pragma solidity 0.5.11;

// interfaces
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/CERC20Eth.sol";

contract cETHMock is ERC20Detailed, ERC20, CERC20Eth {
  using Address for address payable;

  uint256 public toTransfer;
  uint256 public toMint;

  address public _interestRateModel;
  uint256 public _supplyRate;
  uint256 public _exchangeRate;
  uint256 public _totalBorrows;
  uint256 public _totalReserves;
  uint256 public _reserveFactorMantissa;
  uint256 public _getCash;

  constructor(address tokenOwner, address interestRateModel)
    ERC20()
    ERC20Detailed('cETH', 'cETH', 8) public {
    _interestRateModel = interestRateModel;
    _exchangeRate = 200000000000000000000000000;
    _supplyRate = 32847953230;
    _mint(address(this), 10**14); // 1.000.000 cETH
    _mint(tokenOwner, 10**13); // 100.000 cETH
  }

  function mint() external payable returns (uint256) {
    _mint(msg.sender, (msg.value * 10**18)/_exchangeRate);
    return 0;
  }

  function redeem(uint256 amount) external returns (uint256) {
    _burn(msg.sender, amount);
    msg.sender.sendValue(amount * _exchangeRate / 10**18);
    return 0;
  }

  function setParams(uint256[] memory params) public {
    _totalBorrows = params[2];
    _totalReserves = params[4];
    _reserveFactorMantissa = 50000000000000000;
    _getCash = params[6];
  }

  function borrowRatePerBlock() external view returns (uint256) {}

  function exchangeRateStored() external view returns (uint256) {
    return _exchangeRate;
  }
  function _setExchangeRateStored(uint256 _rate) external returns (uint256) {
    _exchangeRate = _rate;
  }
  function supplyRatePerBlock() external view returns (uint256) {
    return _supplyRate;
  }
  function totalReserves() external view returns (uint256) {
    return _totalReserves;
  }
  function getCash() external view returns (uint256) {
    return _getCash;
  }
  function totalBorrows() external view returns (uint256) {
    return _totalBorrows;
  }
  function reserveFactorMantissa() external view returns (uint256) {
    return _reserveFactorMantissa;
  }
  function interestRateModel() external view returns (address) {
    return _interestRateModel;
  }
  function() external payable {}
}
