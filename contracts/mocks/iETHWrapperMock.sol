pragma solidity 0.5.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

import "../interfaces/iERC20Fulcrum.sol";
import "../interfaces/ILendingProtocol.sol";

contract iETHWrapperMock is ILendingProtocol, Ownable {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // protocol token (cToken) address
  address public token;
  uint256 public price;
  uint256 public apr;
  uint256 public nextSupplyRateLocal;
  uint256 public nextSupplyRateWithParamsLocal;

  constructor(address _token) public {
    token = _token;
    nextSupplyRateWithParamsLocal = 2850000000000000000;
  }

  function mint()
    external
    returns (uint256 iTokens) {
      uint256 balance = address(this).balance;
      if (balance == 0) {
        return iTokens;
      }
      // mint the iTokens and transfer to msg.sender
      iTokens = iERC20Fulcrum(token).mintWithEther.value(balance)(msg.sender);
  }

  function redeem(address _account)
    external
    returns (uint256 tokens) {
      uint256 balance = IERC20(token).balanceOf(address(this));
      uint256 expectedAmount = balance.mul(iERC20Fulcrum(token).tokenPrice()).div(10**18);

      tokens = iERC20Fulcrum(token).burnToEther(address(uint160(_account)), balance);
      require(tokens >= expectedAmount, "Not enough liquidity on Fulcrum");
  }

  function underlying() external view returns (address) {

  }

  function nextSupplyRate(uint256) external view returns (uint256) {
    return nextSupplyRateLocal;
  }
  function _setNextSupplyRate(uint256 _nextSupplyRate) external returns (uint256) {
    nextSupplyRateLocal = _nextSupplyRate;
  }
  function _setNextSupplyRateWithParams(uint256 _nextSupplyRate) external returns (uint256) {
    nextSupplyRateWithParamsLocal = _nextSupplyRate;
  }
  function nextSupplyRateWithParams(uint256[] calldata) external view returns (uint256) {
    return nextSupplyRateWithParamsLocal;
  }
  function getAPR() external view returns (uint256) {
    return apr;
  }
  function _setAPR(uint256 _apr) external returns (uint256) {
    apr = _apr;
  }
  function getPriceInToken() external view returns (uint256) {
    return price;
  }
  function _setPriceInToken(uint256 _price) external returns (uint256) {
    price = _price;
  }
  function setIdleToken(address) external {

  }
  function() external payable {}
}
