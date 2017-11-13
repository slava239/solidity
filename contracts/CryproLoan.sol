pragma solidity ^0.4.11;
/** version 1.0
 * Math operations with safety checks
 */
library SafeMath {
  function mul(uint256 a, uint256 b) internal returns (uint256) {
    uint256 c = a * b;
    assert(a == 0 || c / a == b);
    return c;
  }

  function div(uint256 a, uint256 b) internal returns (uint256) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    uint256 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return c;
  }

  function sub(uint256 a, uint256 b) internal returns (uint256) {
    assert(b <= a);
    return a - b;
  }

  function add(uint256 a, uint256 b) internal returns (uint256) {
    uint256 c = a + b;
    assert(c >= a);
    return c;
  }

  function max64(uint64 a, uint64 b) internal constant returns (uint64) {
    return a >= b ? a : b;
  }

  function min64(uint64 a, uint64 b) internal constant returns (uint64) {
    return a < b ? a : b;
  }

  function max256(uint256 a, uint256 b) internal constant returns (uint256) {
    return a >= b ? a : b;
  }

  function min256(uint256 a, uint256 b) internal constant returns (uint256) {
    return a < b ? a : b;
  }

}

contract CryptoLoan {
	using SafeMath for uint;
	
    string public name = "First CryproLoan service";
    
    address public system;

	string borrowerInfo;
	string borrowerId;
	address public borrowerAddress = address(0);
    
    string creditorInfo;
    string creditorId;
	address creditorAddress = address(0);
    
    enum State {Prepared, LoanFunded, SigningStopped, Signed, /*Extended,*/ Expired, DebtRefunded, Completed, MarginCall, /*OnArbitration,*/ CreditorFraud}
    State public contractState; 
    
    //CREDIT INFO 
    uint public creditId;
    uint public creditPeriod; // in days
    uint public creditStart;
    uint public creditEnd;
    uint public creditExtentionEnd;
    uint public creditExtendedPeriod; //total duration in case of extention
    
    uint public creditSum;
    //enum Currency  {RUR, USD, EUR}
    //Currency public creditCurrency = Currency.RUR;
    uint public creditInterest; // in creditCurrency
    uint public creditExtentionInterest; // total interest amount for all credit duration
    bool public creditorAllowExtention = false;
    bool public creditExtentionUsed = false;
    
    uint marginCallEtherRate;
    string marginCallDescription;
    
    uint public systemFee;  //only in Wei!
    uint systemExtendedFee; //total system fee in case of duration extention !!! Only in wei!
    
    uint public repayDebtAmount = 0; //how much the borrower already repayed the debt
    
    uint public loanSum; //only in wei
	bool public loanSumCapped = false;
	
	uint public depositSum = 0;
	
	event LoanSumCapped();
	event DepositMade(uint _newDeposit, uint _depositSum);
	event DebtReturnedAmountIncrease(uint _amount);
	event DebtRefunded();
	event CreditPeriodExtended();
	event SystemFeePayed(uint _feeAmount);
	event LoanRefunded();
	event LoanRefundedToCreditor();
	event CreditPeriodExpired(bool _creditExtentionUsed, uint _creditEnd);

    
	
	function CryptoLoan(
        uint _creditId,
        uint _creditPeriod,
        uint _creditExtendedPeriod,
        uint _creditSum,
        uint _creditInterest,
        uint _creditExtentionInterest,
        bool _creditorAllowExtention,
        uint _marginCallEtherRate,
        uint _systemFee,
        uint _systemExtendedFee,
        uint _loanSum, 
		address _creditorAddress
    ){
		require (_creditorAddress != address(0));
		require (_systemFee > 10000000);    //only in wei!
		require (_systemExtendedFee > 10000000); //only in wei!
		
        // here could be additional static checks based on business processes
		
        creditId = _creditId;
        creditPeriod = _creditPeriod;
        creditExtendedPeriod = _creditExtendedPeriod;
        creditSum = _creditSum;
        creditInterest = _creditInterest;
        creditExtentionInterest = _creditExtentionInterest;
        creditorAllowExtention = _creditorAllowExtention;
        marginCallEtherRate = _marginCallEtherRate;
        systemFee = _systemFee;
        systemExtendedFee = _systemExtendedFee;
        loanSum = _loanSum;
		creditorAddress = _creditorAddress;
        
        system = msg.sender;
        
        contractState = State.Prepared;

    }
	
	function doPayment() payable{
		require(contractState == State.Prepared);
		if (borrowerAddress == address(0))
			borrowerAddress = msg.sender;
		
		depositSum = depositSum.add(msg.value);
		if (depositSum >= loanSum) {
			loanSumCapped = true;
			contractState = State.LoanFunded;
			LoanSumCapped();
		} else
			DepositMade(msg.value, depositSum);
	}
	
	function checkMortgage() onlyOwner returns (bool) {
		return loanSumCapped;
	}
	
	function refundMortgage() onlyOwner {
		require(contractState == State.LoanFunded || contractState == State.Prepared);
		require(borrowerAddress.send(depositSum));
		
		contractState = State.SigningStopped;
	}
	
	function dealSigned(uint _startTime) onlyOwner{ 
		require(contractState == State.LoanFunded); 
		
		creditStart = _startTime;
		
		creditEnd = creditStart + creditPeriod * 1 days;
		creditEnd = creditStart + creditPeriod * 1 days;
		creditExtentionEnd = creditStart + creditExtendedPeriod * 1 days;
		
		contractState = State.Signed;
	}
	
	function extendCreditPeriod() onlyBefore(creditEnd){
		require(msg.sender == borrowerAddress); 
		require(creditorAllowExtention);
		require(!creditExtentionUsed);
		
		creditExtentionUsed = true;
		creditEnd = creditExtentionEnd;
		creditInterest = creditExtentionInterest;
		systemFee = systemExtendedFee;
		
		CreditPeriodExtended();
		
	}
	
	function increaseDebtReturnedAmount(uint amount) onlyOwner 
	//onlyBefore(creditEnd) 
	
	{ // in case of arbitrage here we should 
																						//use more mild condition
		require(contractState == State.Signed);

		repayDebtAmount = repayDebtAmount.add(amount);
		DebtReturnedAmountIncrease(amount);
		
		if (repayDebtAmount >= creditSum + creditInterest) {
			DebtRefunded();

			require (system.send(systemFee));
			SystemFeePayed(systemFee);
			require (borrowerAddress.send(depositSum.sub(systemFee)));  //it will fail, system don't provide additional gas for transactions
			LoanRefunded();
			
			contractState = State.Completed;
		
		}
		
	}
	
	function marginCall(uint rate, string description) onlyOwner{
		require(rate <= marginCallEtherRate);
		require(contractState == State.Signed);
		
		marginCallDescription = description;
		
		contractState = State.MarginCall;
		
		require (system.send(systemFee));
		SystemFeePayed(systemFee);
		require (creditorAddress.send(depositSum.sub(systemFee)));  
		LoanRefundedToCreditor();
		
	}

	function checkExpiration() onlyOwner returns(bool){
//		require (now > creditEnd);
		require (contractState == State.Signed);
		
		if (now <= creditEnd) {
			return false;
		} else { // to be tested
			contractState = State.Expired;
			CreditPeriodExpired(creditExtentionUsed, creditEnd);
			
			require (system.send(systemFee));
			SystemFeePayed(systemFee);
			require (creditorAddress.send(depositSum.sub(systemFee)));  
			LoanRefundedToCreditor();
			return true;
		}
	}
	
	
	function creditorFraud() onlyOwner() {
		require (contractState == State.Signed); 
		
		contractState = State.CreditorFraud;
		
		require (system.send(systemFee)); 
		SystemFeePayed(systemFee); 
		require (borrowerAddress.send(depositSum.sub(systemFee)));  
		LoanRefunded();
		
	}
	
	function returnRestOfTheGas(uint _amount) onlyOwner(){
		require(contractState == State.Completed || contractState == State.MarginCall 
		|| contractState == State.CreditorFraud || contractState == State.Expired || contractState == State.SigningStopped);
		require(system.send(_amount));
	}	
	
	function() payable{

		//require(msg.sender == system);
		//uint i = 1;
	}

	
	modifier onlyOwner() {
		require(msg.sender == system);
		_;
	}
   
	
	modifier onlyBefore(uint time) {
        require (now < time);
        _;
    }

    
    
}