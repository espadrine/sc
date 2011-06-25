Plate = require ('./plate').Plate;



// Test World!
//

var Tests = function () { this.tests = []; this.n = 0; this.errors = 0; };
Tests.prototype.teq = function (a, b) {
  this.n ++;
  if (a !== b) {
    console.log ('#' + this.n + ' failed: got ' + JSON.stringify (b) +
                                ' instead of ' + JSON.stringify (a));
    this.errors ++;
  }
};
Tests.prototype.tldr = function () {
  if (this.errors === 0) { console.log ('All ' + this.n + ' tests passed.');
  } else if (this.errors === this.n) { console.log ('All tests failed.');
  } else {
    console.log ((this.n - this.errors) + ' tests passed out of ' +
                 this.n + ' (' +
                 (100 * (1 - this.errors/this.n)).toFixed (2) + '%).');
  }
};

var t = new Tests ();

// test 1 - 1 level of indentation, escaped {{.

t.teq ((Plate.fmt ('There is {{{\\nso much}}} {{=a man|plain}} can do.\n\n{{=us|html}} we have many friends: \n{{-friend|i|friends;there is {{=friend|plain}}, }}...', {
  'a man': 'Jan',
  'us': 'My friend & I',
  'friends': ['Thaddee', 'Serge', 'Marie']
})), "There is {{\\nso much}} Jan can do.\n\nMy friend &amp; I we have many friends: \nthere is Thaddee, there is Serge, there is Marie, ...");

// test 2 - 2 levels of indentation.

t.teq (Plate.fmt ("Your base belongs to {{-me|i|us;\n- {{-name|j|me;{{=name|plain}} }}; }}",
      {us: [['John', 'Connor'], ['Paul', 'Irish'], ['Ash', 'William']]}),
    "Your base belongs to \n- John Connor ; \n- Paul Irish ; \n- Ash William ; ");

// conditional macro tests.
t.teq (Plate.fmt ('I am{{?present| here. Hello!; out.}} Anyway, how do you do?',
                  {present: true}),
       'I am here. Hello! Anyway, how do you do?');
t.teq (Plate.fmt ('I am{{?present| here. Hello!; out.}} Anyway, how do you do?',
                  {present:false}),
       'I am out. Anyway, how do you do?');

// comment macro test.
t.teq (Plate.fmt ('There should be{{# nothing!}}...', {}),
       'There should be...');

// macro macro test.
t.teq (Plate.fmt ('First param{{!s; return params[0]}}: {{steh; yep...}}!', {}),
       'First param: teh!');

// parser tests.
t.teq (Plate.fmt ('Plain {{=data|plain}}.',{data:'text'}), 'Plain text.');
t.teq (Plate.fmt ('Html {{=data|html}}.',{data:'<text & stuff>'}),
       'Html &lt;text &amp; stuff&gt;.');
t.teq (Plate.fmt ('Uri {{=data|uri}}.',{data:'conversion done'}),
       'Uri conversion%20done.');
t.teq (Plate.fmt ('Non-Uri {{=data|!uri}}.',{data:'conversion%20done'}),
       'Non-Uri conversion done.');
t.teq (Plate.fmt ('Int {{=data|integer}}.',{data:73.6}), 'Int 74.');
t.teq (Plate.fmt ('Radix {{=data|intradix|2}}.',{data:2}), 'Radix 10.');
t.teq (Plate.fmt ('Float {{=data|float|2}}.',{data:73.6}), 'Float 73.60.');
t.teq (Plate.fmt ('Exp {{=data|exp|2}}.',{data:73.6}), 'Exp 7.36e+1.');

// error test.
t.teq (Plate.fmt ('Nonint {{=data|integer}}.',{data:'hi'}), 'Nonint .');

// tl;dr.
t.tldr ();


