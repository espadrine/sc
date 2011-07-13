var Plate = require ('../lib/plate'), Test = require ('./test');

var t = new Test ();

// test 1 - 1 level of indentation, escaped {{.

t.teq ((Plate.format ('There is {{{\\nso much}}} {{=a_man|plain}} can do.\n\n' +
        '{{=us|html}} we have many friends: \n' +
        '{{-friends|friend|i;there is {{=friend|plain}}, }}...', {
  'a_man': 'Jan',
  'us': 'My friend & I',
  'friends': ['Thaddee', 'Serge', 'Marie']
})),
    'There is {{\\nso much}} Jan can do.\n\n' +
    'My friend &amp; I we have many friends: \n' +
    'there is Thaddee, there is Serge, there is Marie, ...');

// test 2 - 2 levels of indentation.

t.teq (Plate.format ('Your base belongs to {{-us|me|i;\n' +
      '- {{-me|name|j;{{=name|plain}} }}; }}',
      {us: [['John', 'Connor'], ['Paul', 'Irish'], ['Ash', 'William']]}),
    'Your base belongs to \n- John Connor ; \n- Paul Irish ; \n' +
    '- Ash William ; ');

// compound expressions
t.teq (Plate.format ('Thaddee {{?apostles.indexOf(thaddee)!=-1|was|wasn\'t}} an apostle'
      ,{thaddee:'Thaddaeus', apostles:['Simon','Andrew','James','John','Philip'
        ,'Bartholomew','Matthew','Thomas','James','Simon','Judas','Judas']})
      ,'Thaddee wasn\'t an apostle');

// conditional macro tests.
t.teq (Plate.format ('I am{{?present| here. Hello!; out.}} Anyway, how do you do?',
                  {present: true}),
       'I am here. Hello! Anyway, how do you do?');
t.teq (Plate.format ('I am{{?present| here. Hello!; out.}} Anyway, how do you do?',
                  {present:false}),
       'I am out. Anyway, how do you do?');

// comment macro test.
t.teq (Plate.format ('There should be{{# nothing!}}...', {}),
       'There should be...');

// macro macro test.
t.teq (Plate.format ('First param{{!s; return params[0]}}: {{steh; yep...}}!', {}),
       'First param: teh!');

// macro macro macro test.
t.teq (Plate.format ('First param{{!first; return params[0]}}: {{~first|teh; yep...}}!', {}),
       'First param: teh!');

// parser tests.
t.teq (Plate.format ('Plain {{=data|plain}}.',{data:'text'}), 'Plain text.');
t.teq (Plate.format ('Html {{=data|html}}.',{data:'<text & stuff>'}),
       'Html &lt;text &amp; stuff&gt;.');
t.teq (Plate.format ('Uri {{=data|uri}}.',{data:'conversion done'}),
       'Uri conversion%20done.');
t.teq (Plate.format ('Non-Uri {{=data|!uri}}.',{data:'conversion%20done'}),
       'Non-Uri conversion done.');
t.teq (Plate.format ('Int {{=data|integer}}.',{data:73.6}), 'Int 74.');
t.teq (Plate.format ('Radix {{=data|intradix|2}}.',{data:2}), 'Radix 10.');
t.teq (Plate.format ('Float {{=data|float|2}}.',{data:73.6}), 'Float 73.60.');
t.teq (Plate.format ('Exp {{=data|exp|2}}.',{data:73.6}), 'Exp 7.36e+1.');

// error test.
t.teq (Plate.format ('Nonint {{=data|integer}}.',{data:'hi'}), 'Nonint .');

// tl;dr.
t.tldr ();


