require('dotenv').config();
var fs = require('fs');
var recursive = require('recursive-readdir');
var https = require('https')
var async = require('async');
var moment = require('moment');
var _ = require('underscore');
var XLSX = require('xlsx');
var nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);
var docSystem = require('../make/js/genDocumentSystem');
var codeSystem = require('../make/js/genCodeSystem');
var makeSql = require('../make/js/makeSql');
var makeCfg = require('../make/js/makeCfg');
//var MD5 = require('md5');
//var replaceExt = require('replace-ext');
var params = '';
var proyectId, subProyectMain, subProyects, esIndex, imageWidth, headerFontSize;

// const { decisionTable } = require('js-feel')();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// process.env.UV_THREADPOOL_SIZE = 512;

// ssh -i "tutorial.pem" ec2-user@tutorial.enlanube.io -t "sudo su -"

// host
var makeToken = process.env.makeToken;
var wasabiHost = process.env.wasabiHost;
var clave = process.env.clave;
var lang = process.env.lang;
var esEntidad = process.env.esEntidad === 'true';
// cd
// cd git/wasabi
// pm2 start dev.json
// pm2 logs

var esHost = process.env.esHost || 'localhost:9200';
// XPS
proyectId = 'tutorial';
esIndex = 'tutorial';

params = '&esDemo=true'; 
subProyects = 'demo';
subProyectMain = 'demo';
logo = 'https://mx-imagenes.s3.amazonaws.com/logos/wasabi.png';
logoSaludNess = 'https://his-imagenes.s3.amazonaws.com/logos/wasabi.png';
imageWidth = 30;
var headers = ['Empresa Demostración','Prado Norte 100, Lomas de Chapultepec 11000','CDMX México']

var logo2 = logo;
var logo3 = logo;
var filename = proyectId+'-metadata.xlsx';
// var filename = '/Users/joseheffes/OneDrive/'+proyectId+'-metadata-compartido.xlsx';

if (filename&&filename.substr(-1)=='.'){
  filename+='xlsx'
}
// elasticsearch

var forceList = [];
var ignoreList = [];
var useMD5 = wasabiHost!='demo.enlanube.io';

if (wasabiHost=='demo.enlanube.io'){
  esIndex = null; // para que no indexe si esta en demo;
}

var trimKeys = function(items){
  if (items && _.isArray(items)){
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = {};
      _.each(items[i], function(value, key){
        item[key.trim()] = value;
      })
      out.push(item)
    }
  }
  return out;
}


var getFileExt = function(filename){
  return filename && filename.split('.').pop();
}

var renameFileExt = function(fileName, newExt){
  if (fileName && newExt){
    return fileName.substr(0, fileName.lastIndexOf('.')) + '.'+newExt;
  }
}

var getFileName = function(filename){
  return filename && filename.replace(/^.*[\\\/]/, '');
}

var makeOne = function(path, filename, options, callback){
  //console.log('makeOne...', path, filename)
  options = options || {};
  if (path.substr(0,5)==='auto/'){
    path = 'auto';
  } else if (path.substr(0,6)==='merge/'||options.isMerge){
    path = 'merge';
  }
  var name = getFileName(filename);
  if (name.indexOf('.')>0 && name.substr(0,2)!=='~$'){
    var ext = getFileExt(filename);
    var data;
    if (ext==='hbs'||ext==='auto'){
      if (fs.existsSync(filename)){
        data = fs.readFileSync(filename);
      }      
    } else
    if (path&&ext==='bpmn'){
      data = fs.readFileSync(filename);
    } else
    if (path=='dmn'&&(ext==='xlsx')){
      var buf = fs.readFileSync(filename);
      var wb = XLSX.read(buf, {type:'buffer'});
      var sheets = wb.SheetNames;    
      data = {};
      _.each(sheets, function(sheet){
        data[sheet] = trimKeys(XLSX.utils.sheet_to_json(wb.Sheets[sheet], {raw: true, defval:null}))
      })
      data = JSON.stringify(data);
    }
    if (data){
      if (path==='auto'||path==='merge'/*||path==='config'*/){
        name = getFileName(filename);
        if (ignoreList.indexOf(name.split('.')[0])<0){
          name = path+'/'+name;  
        } else name = '';
      } else {
        name = getFileName(filename);
        if (ext==='hbs'){
          ignoreList.push(name.split('.')[0]);
        }
        // si es un hbs simpre hay que forzarlo
      }
      if (name){
        var url = '/hbs/make/demo?filename='+name+params+'&path='+path+'&host='+wasabiHost+'&force='+(forceList.indexOf(name)>=0);
        if (makeToken){
          url+='&makeToken='+makeToken;
        }
        if (options.bulk){
          callback(null, {url, data});
        } else {
          let host = wasabiHost=='demo.enlanube.io'?'localhost':wasabiHost;
          var req = https.request({ 
            host: wasabiHost, 
            port: 443,
            path: url,
            method: 'POST',
            timeout: 360000,
          }, function(res){
            if (path==='auto' && res.statusCode==200){
              var hbsName = 'merge/'+name.slice(5).split('.')[0]+'.hbs';
              forceList.push(hbsName);
              // console.log(forceList)
            }
            if (res.statusCode!=201){
              console.log('make...', res.statusCode, filename)  
            }        
            callback(res.statusCode);
          }).on('error', function(err){
            err && console.error('request', err);
          });
          req.write(data);
          req.end();          
        }
      } else callback();
    } else callback();
  } else callback();
}

var doRestart = function(callback){
  var req = https.request({ 
    host: wasabiHost, 
    port: 443,
    path: '/hbs/restart?makeToken='+makeToken,
    method: 'GET',
    timeout: 360000,
  }, function(err){
    callback(err);
  });
  req.end();
}

var doEnd = function(callback){
  var req = https.request({ 
    host: wasabiHost, 
    port: 443,
    path: '/hbs/end?makeToken='+makeToken,
    method: 'GET',
  }, function(err){
    callback(err);
  });
  req.end();
}

var makePath = function(path, options, callback){
  var restart;
  var bulk = false;
  var items = [];
  recursive(path, function (err, files) {
    if (files&&files.length){
      console.log(path+'...',files&&files.length)
      var chunks = _.chunk(files, 100);
      // creo que no tiene que ir en serie en este punto
      // async.eachSeries(files, function(file, callback) {
      async.each(chunks, function(chunk, callback){
        //console.log('chunk...', chunk&&chunk.length)
        var fn = (wasabiHost==='demo.enlanube.io')?'eachSeries':'each';
        async[fn](chunk, function(file, callback) {
          //console.log(file)
          options.bulk = bulk;
          makeOne(path, file, options, function(statusCode, item){
            if (statusCode==202){
              restart = true;
            } else 
            if (bulk&&item){
              items.push(item)
            }
            callback();
          })          
        }, function(err){
          if (bulk){
            console.log('items..', path, items.length);  
          }      
          callback(restart);
        })      
      }, function(err){
        callback(err);
      })
    } else callback();
  })
}


var genAuto = function(proyectId, callback){
  // callback();
  if (proyectId){
    var paso1 = moment();
    var buf = fs.readFileSync(filename);
    console.log('start...', moment().diff(paso1)/1000+'s')
    var wb = XLSX.read(buf, {type:'buffer'});
    console.log('read...', moment().diff(paso1)/1000+'s')
    codeSystem.generate(wasabiHost, wb, proyectId, filename, subProyects, esHost+'/'+esIndex, {useMD5, notIndex:!esIndex, lang, esEntidad, disableActualizacion: true}, function(err, codeSystem){
      console.log('codeSystem...', moment().diff(paso1)/1000+'s')
      docSystem.generate(wasabiHost, wb, proyectId, filename, subProyects, logo3, headers, codeSystem, {imageWidth, headerFontSize, logoSaludNess, useMD5, clave, lang, esEntidad, disableActualizacion: true, unFixUser: true}, function(err){
        console.log('hbs generated...', moment().diff(paso1)/1000+'s')
        //console.log(proyectId+'.es generated...')
        callback(null, codeSystem);
      })
    })
  } else callback();
}

console.log('host', wasabiHost)
  var start = moment();
  genAuto(proyectId, function(err, codeSystem){
    makePath('hbs', {lang, esEntidad}, function(){
      console.log('make hbs...', moment().diff(start)/1000+'s')
      makePath('auto', {lang, esEntidad}, function(){      
        console.log('make auto...', moment().diff(start)/1000+'s')
         makePath('bpmn', {lang, esEntidad}, function(){
          makePath('dmn', {lang, esEntidad}, function(){
            makePath('merge', {lang, esEntidad}, function(){
              makePath(subProyectMain, {lang, esEntidad, isMerge: true}, function(){
                doEnd(function(err){
                  console.log('end...', moment().diff(start)/1000+'s')
                  return process.exit();
                });
              });
            });
          })
        });
      });
    });
  });
