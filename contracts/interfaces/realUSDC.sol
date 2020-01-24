pragma solidity 0.5.11;

interface realUSDC {
  function mint(address to, uint256 mintAmount) external returns (bool);
  function configureMinter(address minter, uint256 minterAllowedAmount) external returns (bool);
}
