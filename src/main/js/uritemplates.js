/*
UriTemapltes Draft 0.4  Parser written in JS/CC
mpo@outerthought.org - 2011

based on spec retrieved from http://tools.ietf.org/html/draft-gregorio-uritemplate-04

"uri-templates syntax (draft 0.4)" {
  template      = { literals | expression } .
  literals      = '%x21' | '%x23-24' | '%x26' | '%x28-3B' | '%x3D' | '%x3F-5B' | '%x5D-5F' | '%x61-7A' | '%x7E' | ucschar | iprivate | pct-encoded .
  expression    = '{' [ operator ] variable_list '}' .
  operator      = "+" | "." | "/" | ";" | "?" | op_reserve .
  op_reserve    = "|" | "!" | "@" .
  variable_list = varspec { ',' varspec } .
  varspec       = varname [ modifier ] [ "=" default ] .
  varname       = varchar {  varchar | "."  } .
  varchar       = ALPHA | DIGIT | '_' | ucschar | iprivate | pct_encoded .
  default       = { unreserved | pct_encoded} .
  modifier      = explode | partial .
  explode       = "*" | "+"  .
  partial       = ( substring | remainder ) offset .
  substring     = ":" .
  remainder     = "^" .
  offset        = [from_end] DIGIT { DIGIT } .
  from_end      = "-" .
} "See http://code.google.com/p/uri-templates/ for updates and work on the spec."
*/

;
(function($){



//-----------------------------------various template syntax features & settings
var simpleSet = { prefix : "", join : ",", 
    encode : function(val) {
        //TODO investigate what other chars need escaping
        return encodeURIComponent(val).replace(/[!]/g, function(s) {return escape(s)} );
    },
    lblval : function(lbl, val, expl, c) {
        c = c || ',';
        return expl ? (lbl ? lbl + c + val : val) : val;
    }
};
var reservedSet = { prefix : "", join : ",", 
    encode : function(val) {
        //TODO investigate what other chars need escaping
        return encodeURI(val);
    },
    lblval : function(lbl, val, expl, c) {
        c = c || ',';
        return expl ? (lbl ? lbl + c + val : val) : val;
    }
};
var OPS_SETTINGS = function(ops) {
    switch(ops) {
        case ''  : return simpleSet; 
        case '+' : return reservedSet; 
        default  : 
            var unimpl = function() { throw "Unimplemented reserved expansion-operator: '"+ops+"'."; }; 
            return {  encode: unimpl, assign: unimpl }; 
    }
}

var noneLblModifier = function(name, k) {
    return name;
};
var compLblModifier = function(name, k) {
    return k;
};
var fullLblModifier = function(name, k) {
    return name + (k ? "." + k : "");
};

var EXPLODELBLMODIFIER = function(expl) {
    expl = expl || '';
    switch(expl) {
        case '' : return noneLblModifier; 
        case '*': return compLblModifier;
        case '+': return fullLblModifier;
    }
};

var PARTMODIFIER = function(part, nums) {
    part = part || '';
    //TODO switch/build others
    return null;
};




//---------------------------------------------- objects in use
function UriTemplate(set) {
    this.set = set;
};
UriTemplate.prototype.expand = function(context) {
    context = context || {};
    var res = "";
    var cnt = this.set.length;
    for (var i = 0; i<cnt; i++ ) {
        res += this.set[i].expand(context);
    }
    return res;
}

function Literal(txt ) {
    this.txt = txt;
}

Literal.prototype.expand = function() {
    return this.txt;
};

function Expression(ops, vars ) {
    this.opss = OPS_SETTINGS(ops);
    this.vars = vars;
};

Expression.prototype.expand = function(context) {
    var opss = this.opss;
    var join = opss.prefix;
    var res = "";
    var cnt = this.vars.length;
    for (var i = 0 ; i< cnt; i++) {
        var varspec = this.vars[i];
        varspec.iterate(context, opss.encode, function(key, val, explodes, del) {
            var segm = opss.lblval(key, val, explodes, del);
            if (segm) {
                res += join + segm;
                join = opss.join;
            }
        });
    }
    return res;
};

function VarSpec (name, expl, part, nums, defs) {
    this.name = name;
    this.explLbl = EXPLODELBLMODIFIER(expl);
    this.explodes = !!expl; // make it boolean
    this.defs = defs;
};

VarSpec.prototype.iterate = function(context, encoder, adder) {
    var val = context[this.name];
    if (val == null) val =  this.defs;
    
    if ($.isFunction(val))
        val = val(context);
    
    if (!this.explodes) { // no exploding: wrap values into string
        var joined = "";
        var join = "";
        if (val && val.constructor === Array) {
            var cnt = val.length;
            for (var i=0; i<cnt; i++) {
                if (val[i] != null) {
                    joined += join + encoder(val[i]);
                    join = ",";
                }
            }
        } else if (val && val.constructor === Object) {
            for (k in val) {
                if (val[k] != null) {
                    joined += join + k + ',' + encoder(val[k]);
                    join = ",";
                }
            }
        } else {
            joined = val == null ? null : encoder(val);
        }       
        
        if (joined != null) 
            adder(this.name, joined);
    } else if (val == null || val.length == 0 ) {
        //ignore - don't add anything
    } else if (val.constructor === Array) {
        var cnt = val.length;
        var lbl = this.explLbl(this.name);
        for (var i=0; i<cnt; i++) {
            adder(lbl, encoder(val[i]), true, '.' );
        }
    } else if (val.constructor === Object) {
        for (k in val) {
            adder(this.explLbl(this.name, k),  encoder(val[k]) , true);
        }
    } else { // explode-requested, but single value
        adder(this.explLbl(this.name), encoder(val));
    }
};

//----------------------------------------------parsing logic
// How each varspec should look like
var VARSPEC_RE=/([A-Za-z0-9_][A-Za-z0-9_.]*)(([*+])|([:^])(-?[0-9]+))?(=([^{},]*))?/;

var match2varspec = function(m) {
    var name = m[1];
    var expl = m[3];
    var part = m[4];
    var nums = m[5];
    var defs = m[7];
    
    return new VarSpec(name, expl, part, nums, defs);
};


// Splitting varspecs in list
var LISTSEP_RE=/,/;


// How each template should look like
var TEMPL_RE=/({([+.;?/|!@])?(([A-Za-z0-9_][A-Za-z0-9_.]*)(([*+])|([:^])(-?[0-9]+))?(=([^{},]*))?(,([A-Za-z0-9_][A-Za-z0-9_.]*)(([*+])|([:^])(-?[0-9]+))?(=([^{},]*))?)*)})/g;

var match2expression = function(m) {
    var expr = m[0];
    var ops = m[2] || '';
    var vars = m[3].split(LISTSEP_RE);
    var len = vars.length;
    for (var i=0; i<len; i++) {
        var match;
        if ( (match = vars[i].match(VARSPEC_RE)) == null) {
            throw "unexpected parse error in varspec: " + vars[i];
        }
        vars[i] = match2varspec(match);
    }
    
    return new Expression(ops, vars);
};


var pushLiteralSubstr = function(set, src, from, to) {
    if (from < to) {
        var literal = src.substr(from, to - from);
        set.push(new Literal(literal));
    }
};

var parse = function(str) {
    var lastpos = 0;
    var comp = [];
        
    var match;
    var pattern = TEMPL_RE;
    pattern.lastIndex = 0; // just to be sure
    while ((match = pattern.exec(str)) != null) {
        var newpos = match.index;
        pushLiteralSubstr(comp, str, lastpos, newpos);
        
        comp.push(match2expression(match));
        lastpos = pattern.lastIndex;
    }
    pushLiteralSubstr(comp, str, lastpos, str.length);

    return new UriTemplate(comp);
};


//-------------------------------------------comments and ideas

//TODO: consider building cache of previously parsed uris or even parsed expressions?



//------------------------------------- availability in jquery context
$.extend({"uritemplate": parse});

})(jQuery);
