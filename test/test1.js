var cryptoLoan = artifacts.require("CryptoLoan.sol");

contract( 'Tests', function(accounts){
	
	 const contractInitialParams = {
		_creditId: 239,
        _creditPeriod: 30,
        _creditExtendedPeriod: 60,
        _creditSum: 10000,
        _creditInterest: 1000,
        _creditExtentionInterest: 2000,
        _creditorAllowExtention: true,
        _marginCallEtherRate: 200,
        _systemFee: 10**17,   
        _systemExtendedFee: 2*10**17,
        _loanSum: 16 *10**17,  // примерно столько эфиров сто€т 300000. отдельно нужно будет поработать с дроб€ми. »ли цены указывать в wei 
        _creditorAddress: accounts[5]

		 
    };
	// 239, 30, 60, 10000, 1000, 2000, "true", 200, 100, 200, 1600000000000000000, "0x79160a097ab1967d343c0c39bdebd091070c5579"
	
	/*
	accounts[0] - system
	accounts[1] - borrower
	acconuns[2] - borrower friend
	accounts[5] - creditor
	
	*/

	it("asyncronic test", async function(){
		myContract = await cryptoLoan.new(...Object.values(contractInitialParams));
		assert.equal(parseInt((await myContract.creditId()).valueOf()), 239);
		assert.equal(parseInt((await myContract.creditPeriod()).valueOf()), 30);
	});
	
	it("Loan deposit tests", async function(){
		console.log("system balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[0]))));
		
		//check the constructor
		myContract = await cryptoLoan.new(...Object.values(contractInitialParams), {from: accounts[0]});
		assert.equal(await myContract.system(), accounts[0]);
		
		let result1 = true;
		result1 = await myContract.checkMortgage.call();
		assert.isFalse(result1);
		
		assert.equal(await myContract.depositSum(), 0);

		//check the accounts balances
		console.log("borrower balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))));
		
		await myContract.doPayment({from: accounts[1], value: 10 * 10**17});
		console.log("borrower balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))));

		//after first payment
		console.log("deposit sum: " + parseFloat(web3.fromWei(await myContract.depositSum())));
		
		console.log("loan sum: " + parseFloat(web3.fromWei(await myContract.loanSum())));
		
		assert.equal(await myContract.depositSum(), 10**18); 
		
		assert.equal(await myContract.borrowerAddress(), accounts[1]); 
		result1 = await myContract.checkMortgage.call(); // и тут. И дальше
		assert.equal(result1, false);

		//second payment
		console.log("friend:" + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[2]))));
		await myContract.doPayment({from: accounts[2], value: 10 * 10**17 });  
		console.log("friend:" + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[2]))));
		assert.equal(await myContract.depositSum(), 20* 10**17); 
//		
		//check that the second payment don't affect the borrower address
		assert.equal(await myContract.borrowerAddress(), accounts[1]); 
		result1 = await myContract.checkMortgage.call();
		assert.equal(result1, true);
//
		//check refundMortgage()
		await myContract.refundMortgage.call({from: accounts[0]});
		console.log(parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))));

		
		
	});
	it("test RefundMortgage events", async function(){
		myContract = await cryptoLoan.new(...Object.values(contractInitialParams), {from: accounts[0]});
		
		let loanSumCappedEventListener = myContract.LoanSumCapped();
		let refundMortgageEventListener = myContract.LoanSumCapped();
		
		await myContract.doPayment({from: accounts[1], value: 10 * 10**17});
		
        let loanSumCappedLog = await new Promise(
            (resolve, reject) => loanSumCappedEventListener.get(
                (error, log) => error ? reject(error) : resolve(log)
            ));
        assert.equal(loanSumCappedLog.length, 0, 'should be 0 events');		
		
		await myContract.doPayment({from: accounts[2], value: 10 * 10**17});
		
        loanSumCappedLog = await new Promise(
            (resolve, reject) => loanSumCappedEventListener.get(
                (error, log) => error ? reject(error) : resolve(log)
            ));
        assert.equal(loanSumCappedLog.length, 1, 'should be 1 events');		

	
		await myContract.refundMortgage.call({from: accounts[0]});
		
        let refundMortgageLog = await new Promise(
            (resolve, reject) => refundMortgageEventListener.get(
                (error, log) => error ? reject(error) : resolve(log)
            ));
        assert.equal(refundMortgageLog.length, 1, 'should be 1 events');		
		
	});
	
	it("test dealSigned(), extendCreditPeriod(), increaseDebtRefunding()", async function(){
		myContract = await cryptoLoan.new(...Object.values(contractInitialParams), {from: accounts[0]});
		//myContract = await cryptoLoan.new(239, 30, 60, 10000, 10**17, 2*10**17, true, 200, 100, 200, "1600000000000000000", "0x79160a097ab1967d343c0c39bdebd091070c5579", {from: accounts[0]});
	
		await myContract.doPayment({from: accounts[1], value: 16 * 10**17}); // accurate amount
		
	    let startTime = Date.now();
		console.log(startTime);
		
		await myContract.dealSigned(startTime); 
		console.log(parseInt(await myContract.creditStart()));
		console.log(parseInt(await myContract.creditEnd()));
		
		assert.equal(await myContract.creditStart(), startTime); 
		
		await myContract.extendCreditPeriod.call({from: accounts[1]}); 
		
		assert.isTrue(startTime < parseInt(await myContract.creditEnd())); 
		

   		let loanRefundedEventListener = myContract.LoanRefunded();

		await myContract.increaseDebtReturnedAmount(10000);
		assert.equal(parseInt(await myContract.repayDebtAmount()), 10000);
		
		console.log("system balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[0]))));
		console.log("borrower balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))));
		
		await myContract.increaseDebtReturnedAmount(2000);  //credit interest was increased after period extention
		
		console.log("new system balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[0]))));
		console.log("new borrower balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))));

        loanRefundedLog = await new Promise(
            (resolve, reject) => loanRefundedEventListener.get(
                (error, log) => error ? reject(error) : resolve(log)
            ));
        assert.equal(loanRefundedLog.length, 1, 'should be 1 events');		
		
	});
	
	it("test checkExpiration(), marginCall()", async function(){
		myContract = await cryptoLoan.new(...Object.values(contractInitialParams), {from: accounts[0]});
	
		await myContract.doPayment({from: accounts[1], value: 16 * 10**17}); // accurate amount
		
	    let startTime = Date.now();
		await myContract.dealSigned(startTime); 
		//expiration in case of not expiried
		//assert.isFalse(parseBool(await myContract.checkExpiration({from: accounts[0]}))); !!!!!!!!!!!!!!!!!!!!
		
		//marginCall

		console.log("system balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[0]))));
		let cb = parseFloat(web3.fromWei(web3.eth.getBalance(accounts[5])));
		console.log("creditor balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[5]))));
		
		await myContract.marginCall(100, "Oh, my God!");
		
		console.log("new system balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[0]))));
		console.log("new creditor balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[5]))));

		console.log(cb +" "+  contractInitialParams._loanSum + " " + contractInitialParams._systemFee);
		assert.equal(parseFloat(web3.fromWei(web3.eth.getBalance(accounts[5]))), cb + parseFloat(web3.fromWei(contractInitialParams._loanSum)) - parseFloat(web3.fromWei(contractInitialParams._systemFee)));
		
		
	});
	it("test creditorFraud(), returnRestOfTheGas()", async function(){
		myContract = await cryptoLoan.new(...Object.values(contractInitialParams), {from: accounts[0]});
	
		await myContract.doPayment({from: accounts[1], value: 16 * 10**17}); // accurate amount
		
	    let startTime = Date.now();
		await myContract.dealSigned(startTime); 
		
		//creditorFraud

		console.log("system balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[0]))));
		let bb = parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1])));
		console.log("borrower balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))));
		
		await myContract.creditorFraud({from: accounts[0]}); 
		
		console.log("new system balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[0]))));
		console.log("new borrower balance: " + parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))));

		console.log(bb +" "+  contractInitialParams._loanSum + " " + contractInitialParams._systemFee);
		assert.equal(parseFloat(web3.fromWei(web3.eth.getBalance(accounts[1]))), bb + parseFloat(web3.fromWei(contractInitialParams._loanSum)) - parseFloat(web3.fromWei(contractInitialParams._systemFee)));
		
		// returnRestOfTheGas was tested at Mist
		
		
		
		
		
		
	});
	
	it("test checkExpiration() in case of expiration", async function(){
		
	});
	
	
})



