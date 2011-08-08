/*
UriTemapltes Draft 0.5  Tempolate Processor
(c) marc.portier@gmail.com - 2011
Distributed under ALPv2 
*/

;
(function($){


/**
 * Create a runtime cache around retrieved values from the context.
 * This allows for dynamic (function) results to be kept the same for multiple expansions within one template
 * Uses key-value tupples in stead to be able to cache null values as well
 */
function CachingContext(context) {
    this.raw = context;
    this.cache = {};
}

CachingContext.prototype.get = function(key) {
    var val = this.raw[key];
    var result = val;
    
    if ($.isFunction(val)) { // check function-result-cache
        var tupple = this.cache[key];
        if (tupple != null) { 
            result = tupple.val;
        } else {
            result = val(this.raw);
            this.cache[key] = {key: key, val: result}; // by storing tupples we make sure a null return is validly consistent too in expansions
        }
    }
    
    return result;
}

function UriTemplate(set) {
    this.set = set;
};
UriTemplate.prototype.expand = function(context) {
    var cache = new CachingContext(context);
    var res = "";
    var cnt = this.set.length;
    for (var i = 0; i<cnt; i++ ) {
        res += this.set[i].expand(cache);
    }
    return res;
}

function Literal(txt ) {
    this.txt = txt;
}

Literal.prototype.expand = function() {
    return this.txt;
};



var RESERVEDCHARS_RE = new RegExp("[:/?#\\[\\]@!$&()*+,;=']","g");
function encodeNormal(val) {
    return encodeURIComponent(val).replace(RESERVEDCHARS_RE, function(s) {return escape(s)} );
}

var SELECTEDCHARS_RE = new RegExp("[\"']","g");
function encodeReserved(val) {
    return encodeURI(val).replace(SELECTEDCHARS_RE, function(s) {return escape(s)} );
}


function addUnNamed(name, key, val) {
    return key + (key.length > 0 ? "=" : "") + val;
}

function addNamed(name, key, val) {
    if (!key || key.length == 0) 
        key = name;
    return key + (key.length > 0 ? "=" : "") + val;
}

function addLabeled(name, key, val, noName) {
    noName = noName || false;
    if (noName) { name = ""; }
    
    if (!key || key.length == 0) 
        key = name;
    return key + (key.length > 0 && val ? "=" : "") + val;
}


var simpleConf = { 
    prefix : "",     joiner : ",",     encode : encodeNormal,    builder : addUnNamed
};
var reservedConf = { 
    prefix : "",     joiner : ",",     encode : encodeReserved,  builder : addUnNamed
};
var pathParamConf = { 
    prefix : ";",    joiner : ";",     encode : encodeNormal,    builder : addLabeled
};
var formParamConf = { 
    prefix : "?",    joiner : "&",     encode : encodeNormal,    builder : addNamed
};
var pathHierarchyConf = { 
    prefix : "/",    joiner : "/",     encode : encodeNormal,    builder : addUnNamed
};
var labelConf = { 
    prefix : ".",    joiner : ".",     encode : encodeNormal,    builder : addUnNamed
};


function buildExpression(ops, vars) {
    var conf;
    switch(ops) {
        case ''  : conf = simpleConf; break;
        case '+' : conf = reservedConf; break;
        case ';' : conf = pathParamConf; break;
        case '?' : conf = formParamConf; break;
        case '/' : conf = pathHierarchyConf; break;
        case '.' : conf = labelConf; break;
        default  : throw "Unexpected operator: '"+ops+"'"; 
    }
    return new Expression(conf, vars);
}

function Expression(conf, vars ) {
    $.extend(this, conf);
    this.vars = vars;
};

Expression.prototype.expand = function(context) {
    var joiner = this.prefix;
    var nextjoiner = this.joiner;
    var buildSegment = this.builder;
    var res = "";
    var cnt = this.vars.length;
    for (var i = 0 ; i< cnt; i++) {
        var varspec = this.vars[i];
        varspec.addValues(context, this.encode, function(key, val, noName) {
            var segm = buildSegment(varspec.name, key, val, noName);
            if (segm != null) {
                res += joiner + segm;
                joiner = nextjoiner;
            }
        });
    }
    return res;
};




/** 
 * Helper class to help grow a string of (possibly encoded) parts until limit is reached
 */
function Buffer(limit) {
    this.str = "";
    if (limit == UNBOUND) {
        this.appender = Buffer.UnboundAppend;
    } else {
        this.len = 0;
        this.limit = limit; 
        this.appender = Buffer.BoundAppend;
    }
}

Buffer.prototype.append = function(part, encoder) {
    return this.appender(this, part, encoder);
}

Buffer.UnboundAppend = function(me, part, encoder) {
    part = encoder ? encoder(part) : part;
    me.str += part;
    return me;
}

Buffer.BoundAppend = function(me, part, encoder) {
    part = part.substring(0, me.limit - me.len);
    me.len += part.length;
    
    part = encoder ? encoder(part) : part;
    me.str += part;
    return me;
}


function arrayToString(arr, encoder, maxLength) {
    var buffer = new Buffer(maxLength);    
    var joiner = "";

    var cnt = arr.length;
    for (var i=0; i<cnt; i++) {
        if (arr[i] != null) {
            buffer.append(joiner).append(arr[i], encoder);
            joiner = ",";
        }
    }
    return buffer.str;
}

function objectToString(obj, encoder, maxLength) {
    var buffer = new Buffer(maxLength);    
    var joiner = "";

    for (k in obj) {
        if (obj[k] != null) {
            buffer.append(joiner + k + ',').append(obj[k], encoder);
            joiner = ",";
        }
    }
    return buffer.str;
}


function simpleValueHandler(me, val, valprops, encoder, adder) {
    // convert composite to string
    // encode complete and add
    var result;
    
    if (valprops.isArr) {
        result = arrayToString(val, encoder, me.maxLength);
    } else if (valprops.isObj) {
        result = objectToString(val, encoder, me.maxLength)
    } else {
        var buffer = new Buffer(me.maxLength);
        result = buffer.append(val, encoder).str;
    }       
    
    adder("", result);
}

function explodeValueHandler(me, val, valprops, encoder, adder) {
    //step through composite 
    // add encoded vals
    
    if (valprops.isArr) {
        var cnt = val.length;
        for (var i=0; i<cnt; i++) {
            adder("", encoder(val[i]), true );
        }
    } else if (valprops.isObj) {
        for (k in val) {
            adder(k, encoder(val[k]) );
        }
    } else { // explode-requested, but single value
        adder("", encoder(val));
    }
}

function valueProperties(val) {
    var isArr = false;
    var isObj = false;
    var isUndef = true;  //note: "" is empty but not undef
    
    if (val != null) {
        isArr = (val.constructor === Array);
        isObj = (val.constructor === Object);
        isUndef = false || (isArr && val.length == 0) || (isObj && $.isEmptyObject(val));
    } 
    
    return {isArr: isArr, isObj: isObj, isUndef: isUndef};
}


var UNBOUND = {};
function buildVarSpec (name, expl, part, nums) {
    var valueHandler, valueModifier;
    
    if (!!expl) { //interprete as boolean
        valueHandler = explodeValueHandler;
    } else 
        valueHandler = simpleValueHandler;
        
    if (!part) {
        nums = UNBOUND;
    }
    
    return new VarSpec(name, valueHandler, nums);
};

function VarSpec (name, vhfn, nums) {
//TODO read spec on what makes a correct name: if no pcnt_encoded is allowed, no need to unescape
// in the other case: fix the regexp for valid templates so we actually get here.
    this.name = unescape(name); 
    this.valueHandler = vhfn;
    this.maxLength = nums;
};

VarSpec.prototype.addValues = function(context, encoder, adder) {
    var val = context.get(this.name);
    var valprops = valueProperties(val);
    if (valprops.isUndef) return; // ignore empty values 
    this.valueHandler(this, val, valprops, encoder, adder);
}
    
    

//----------------------------------------------parsing logic
// How each varspec should look like
var VARSPEC_RE=/([A-Za-z0-9_][A-Za-z0-9_.]*)((\*)|(:)([0-9]+))?/;

var match2varspec = function(m) {
    var name = m[1];
    var expl = m[3];
    var part = m[4];
    var nums = parseInt(m[5]);
    
    return buildVarSpec(name, expl, part, nums);
};


// Splitting varspecs in list with:
var LISTSEP=",";

// How each template should look like
var TEMPL_RE=/({([+.;?/])?(([A-Za-z0-9_][A-Za-z0-9_.]*)(\*|:([0-9]+))?(,([A-Za-z0-9_][A-Za-z0-9_.]*)(\*|:([0-9]+))?)*)})/g;
// Note: reserved operators: |!@ are left out of the regexp in order to make those templates degrade into literals 
// (as expected by the spec - see tests.html "reserved operators")


var match2expression = function(m) {
    var expr = m[0];
    var ops = m[2] || '';
    var vars = m[3].split(LISTSEP);
    var len = vars.length;
    for (var i=0; i<len; i++) {
        var match;
        if ( (match = vars[i].match(VARSPEC_RE)) == null) {
            throw "unexpected parse error in varspec: " + vars[i];
        }
        vars[i] = match2varspec(match);
    }
    
    return buildExpression(ops, vars);
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
