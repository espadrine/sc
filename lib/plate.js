/* plate.js: templating language.
 * Copyright (c) 2011 Thaddee Tyl, Jan Keromnes. All rights reserved. */

(function () {




Plate = {};
Plate._escape = function (text) {
  return text.replace ('{{','{').replace ('}}','}');
};
Plate.trans = function (text, literal) {
  var opencurl = /(?:^|[^\{])\{\{[^\{]/;
  var closecurl = /(?:^|[^\}])\}\}(?!\})/;

  // Find the first {{ there is.
  var operation = opencurl.exec (text);
  if (operation === null) { return Plate._escape (text); }
  if (operation[0].length > 3) {
    operation.index ++;
    operation[0] = operation[0].slice (1);
  }
  var firstcurl = operation.index;

  // Find the next }} there is after that.
  var nextcurl = closecurl.exec (text.slice (firstcurl)).index+1 + firstcurl;
  //var nextcurl = text.indexOf ('}}', firstcurl);

  // Count the number of {{ in between.
  var countopencurl = 0;
  while ((firstcurl = (opencurl.exec (text.slice (firstcurl+2)) !== null?
                       opencurl.exec (text.slice (firstcurl+2)).index+1
                       + firstcurl+2: 0))
         < nextcurl  &&  firstcurl > operation.index) {
    countopencurl ++;
  }

  // Skip as many }}.
  for (var i=0;  i < countopencurl;  i++) {
    //nextcurl = text.indexOf ('}}', nextcurl+2);
    nextcurl = closecurl.exec (text.slice (nextcurl+2)).index+1 + nextcurl+2;
  }
  
  var span = text.slice (operation.index + 3, nextcurl);
  ///console.log (span);
  
  // Use macro.
  var macro = operation[0][2];

  // Fragment the parameters.
  var params = [];
  var semi = span.indexOf (';');
  var prevpipe = pipe = 0;
  while ((pipe = span.indexOf ('|', pipe)) > -1
         && (semi>0? pipe < semi: true)) {
    params.push (span.slice (prevpipe, pipe));
    prevpipe = (pipe ++) + 1;
  }
  if (semi > 0) {
    params.push (span.slice (prevpipe, semi));
    prevpipe = semi+1;
  }
  params.push (span.slice (prevpipe));
  ///console.log (params);

  // Call the macro.
  return Plate._escape (text.slice (0, operation.index)) +
      Plate._escape (Plate.macros[macro] (literal, params)) +
      ((nextcurl+=2) > text.length? '':
      Plate.trans (text.slice (nextcurl), literal));

};

Plate.macros = {
  '=': function (literal, params) {
    return literal[params[0]];
  },
  '-': function (literal, params) {
    var list = '';
    var newliteral = literal;
    for (var i in literal[params[2]]) {
      newliteral[params[0]] = literal[params[2]][i];
      newliteral[params[1]] = i;
      list += Plate.trans (params[3], literal);
    }
    return list;
  }
};


// test 1 - 1 level of indentation, escaped {{.

var text = 'There is {{{so much}}} {{=a man|plain}} can do.\n\n{{=My friend|capitalize}} has many friends: \n{{-friend|i|friends;there is {{=friend|plain}}, }}...';
console.log (Plate.trans (text, {
  'a man': 'Jan',
  'My friend': 'Yann',
  'friends': ['Thaddee', 'Serge', 'Marie']
}));

// test 2 - 2 levels of indentation.

console.log (Plate.trans ("Your base belongs to {{-me|i|us;\n- {{-name|j|me;{{=name|plain}} }}; }}", {us: [['John', 'Connor'], ['Paul', 'Irish'], ['Ash', 'William']]}));

exports.Plate = Plate;


})();


// vim:sw=2 tw=80
