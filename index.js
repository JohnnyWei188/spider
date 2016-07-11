var fetch = require('node-fetch');
var cheerio = require('cheerio');
var urlUtil = require('url');
var async = require('async');
var configUtil = require('config');
var moment = require('moment');
var Entities = require('html-entities').XmlEntities;
entities = new Entities();
var nowDateFormat = moment();
var log4js = require("log4js");
var mysql = require("mysql");
var query = require(__dirname + '/lib/mysql.js');


var Config = function(){
    this.opt = [];
    this.arrType = [];
    this.debug = configUtil.get('debug');
    this.siteConfig = configUtil.get('siteConfig');            //网站URL相关配置
    this.ruleConfig = configUtil.get('domRules');              //网站获取内容的节点相关配置
    this.typeName = configUtil.get('artTypeName');
    this.arrCategory = configUtil.get('artType');
    
    for(var type in this.siteConfig){                         //获取所有抓取的文章类型
        this.arrType.push(type);
        this.site(type);
    }
};

/**
 * 解析配置文件
 * @param {type} type
 * @returns {undefined}
 */
Config.prototype.site = function(type){
    var self = this;
    self.siteCfg = self.siteConfig[type];
    for(var idx in self.siteCfg){
        var ruleName = self.siteCfg[idx]['rule'];
        var rulesInfo = self.rule(ruleName);
        var sitesInfo = self.siteCfg[idx]['urls'];
        var arrPageUrls = [];           //通过分页设置生成的URL数组
        for(var idxx in sitesInfo){
            var arrUrls = sitesInfo[idxx];
            var isPage = false , url = arrUrls[0];
            if(arrUrls.length > 1){
                isPage = true;              //是否有分页配置
                var sPage = arrUrls[1];
                var ePage = arrUrls[2];
            }
            if(isPage){
                for(i = sPage; i <= ePage; i++){                 //生成分页URL
                    arrPageUrls.push(url.replace(/{X}/, i));
                }
            }else if(rulesInfo.pageLink.length > 0){            //只能通过配置的DOM获取分页的URL
                //TODO
            }else{                                              //没有分页链接，直接采集当前的URL
                arrPageUrls.push(url);
            }
        }
        if(arrPageUrls.length > 0){
            var Conf = {};
            rulesInfo.type = type;
            rulesInfo.typeName = self.typeName[type];
            rulesInfo.ruleName = ruleName;
            rulesInfo.category_id = self.arrCategory[type];
            Conf.rule = rulesInfo;
            Conf.urls = arrPageUrls;
            self.opt.push(Conf);
        }
    }
};

//获取DOM规则配置
Config.prototype.rule = function(rule){
    var self = this;
    self.ruleCfg = self.ruleConfig[rule];
    return self.ruleCfg;
};

/**
 * 日志类
 * @returns {Log}
 */
var Logger = function(){
    var log4js_config = require(__dirname+"/config/log.json");
    log4js.configure(log4js_config);
    this.LogDateUrl = log4js.getLogger('get_url');
    this.LogDateArt = log4js.getLogger('get_art');
    this.LogDetail = log4js.getLogger('detail');
};


/**
 * 爬虫类
 * @returns {Robot}
 */
var Robot = function(){
    this.oCfg = new Config();
    this.oLog = new Logger();
};

/**
 * 爬虫启动
 * @returns {Boolean}
 */
Robot.prototype.start = function(){
    var self = this;
//    console.log(self.oCfg.opt);
    self.oCfg.opt.forEach(function(confInfo){
        var ruleInfo = confInfo.rule;
        var arrUrls = confInfo.urls;        //通过分页设置获取的所有需要采集的网页URL
        async.eachLimit(arrUrls, 1, function(url, callback){
            self.crawl(ruleInfo, url, self.parseUrl, null, callback);
        }, function(err){
            if(err){
                self.oLog.LogDetail.info("["+err+"]  并发限制抓取失败");
                self.oCfg.debug && console.error("["+err+"]  并发限制抓取失败");
            }
        });
    });
};


/**
 * 爬取数据
 * @param {type} ruleInfo
 * @param {type} url
 * @param {type} cb
 * @param {type} artDate URL日期  有此参数表明当前调用为采集文章内容
 * @param {type} callback 并发控制回调函数
 * @returns {undefined}
 */
Robot.prototype.crawl = function(ruleInfo, url, cb, artDate, callback){
    var self = this;
    self.currency++;
    var isArtUrl = artDate ? true : false;     //当前URL是文章详情的URL 否则是文章列表的URL
    if(isArtUrl){
        self.oLog.LogDetail.info("["+url+"]  开始采集文章详情");
        self.oCfg.debug && console.info("["+url+"]  开始采集文章详情"); 
    }else{
        self.oLog.LogDetail.info("["+url+"]  开始采集源页面，获取文章URL");
        self.oCfg.debug && console.log("["+url+"]  开始采集源页面，获取文章URL");
    }
    fetch(url, {method: 'GET', redirect: "error", timeout: 30000, headers: {Connection: 'keep-alive'}, compress: true }).then(function(res){   // headers: {Connection: 'Close'},
        var ret = '';
        if(!res.ok){
            if(isArtUrl){
                self.oLog.LogDateArt.error("["+url+"]  文章采集失败(1),失败原因:[" + res.status + " " + res.statusText+"]");
            }else{
                self.oLog.LogDateUrl.error("["+url+"]  URL采集失败(1),失败原因:[" + res.status + " " + res.statusText+"]");
            }
            self.oLog.LogDetail.error("["+url+"]  采集失败,失败原因:[" + res.status + " " + res.statusText+"]");
            self.oCfg.debug && console.error(url + " 异常(1)，原因: " + res.status + " " + res.statusText);
        }else{
            ret = res.text();
        }
        return ret;
    }).then(function(body){
        setTimeout(function(){
            callback();
            isArtUrl ? cb.call(self, ruleInfo, url, body, artDate) : cb.call(self, ruleInfo, url, body); 
         }, 3000);
    }).catch(function(ex){
        if(isArtUrl){
            self.oLog.LogDateArt.error("["+url+"]  文章采集失败(2),失败原因:["+ex.type+" "+ex.message+"]");
        }else{
            self.oLog.LogDateUrl.error("["+url+"]  URL采集失败(2),失败原因:["+ex.type+" "+ex.message+"]");
        }
        self.oLog.LogDetail.error("["+url+"]  采集(2),失败原因:["+ex.type+" "+ex.message+"]");
        self.oCfg.debug && console.error(url + " 异常(2)，原因: " + ex.type+" "+ex.message);
        setTimeout(function(){
             callback();
         }, 5000);
        return true;
    });
};

/**
 * 解析获取文章列表页面上的文章URL
 * @param {type} ruleInfo
 * @param {type} url
 * @param {type} body
 * @returns {undefined}
 */
Robot.prototype.parseUrl = function(ruleInfo, url, body){
    var self = this;
    var domUrlList = '';
    var isEval = false;
    var arrUrls = [];
    self.oLog.LogDetail.info("["+url+"]  采集URL源页面成功");
    self.oCfg.debug && console.info("["+url+"]  采集URL源页面成功");
    var $ = cheerio.load(body);
    if(ruleInfo.eval){                      //如果配置了eval参数，则需要特殊处理 生成DOM
        domUrlList = eval(ruleInfo.urlList);
        isEval = true;
    }else{
        domUrlList = $(ruleInfo.urlList);
    }
    domUrlList.each(function(idx, element){
        var $element = $(element);
        var urlDate, artUrl;
        if(isEval){     //如果配置了eval参数，则需要特殊处理 生成DOM
            urlDate = eval(ruleInfo.urlDate).text();
            artUrl = eval(ruleInfo.url).attr('href');
        }else{
            urlDate = $element.find($(ruleInfo.urlDate)).text();
            artUrl = $element.find($(ruleInfo.url)).attr('href');
        }
        
        if(artUrl){
            artUrl = urlUtil.resolve(url, artUrl);
        }else{
            self.oLog.LogDetail.warn("["+url+"]  第["+idx+"]个节点位置中的DOM元素不一致，获取URL失败");
            self.oLog.LogDateArt.warn("["+url+"]  第["+idx+"]个节点位置中的DOM元素不一致，获取URL失败");
            self.oCfg.debug && console.warn("["+url+"]  第["+idx+"]个节点位置中的DOM元素不一致，获取URL失败");
            return true;
        }
        
        var urlDateFormat = moment(urlDate, "YYYY-MM-DD");                  //采集的URL的日期
        //判断日期
        if(ruleInfo.lastDate == 'yesterday'){                               //只取前一天的数据
            if((urlDateFormat.diff(nowDateFormat, 'days')) !== -1){         //不是前一天的 continue
                return true;
            }
        }else{          //取指定日期以前的数据
            var lastDateFormat = moment(ruleInfo.lastDate, "YYYY-MM-DD");       //采集截止的日期
            if(urlDateFormat.diff(lastDateFormat, 'days') < 0){                 //超出了指定了日期 continue
                return true;
            }
        }
        arrUrls.push({urlDate: urlDate, artUrl: artUrl});
    });
    async.eachLimit(arrUrls, 5, function(urlObj, callback){
        self.crawl(ruleInfo, urlObj.artUrl, self.parseArt, urlObj.urlDate, callback);
    });
};

/**
 * 解析页面内容
 * @param {type} ruleInfo
 * @param {type} url
 * @param {type} body
 * @returns {undefined}
 */
Robot.prototype.parseArt = function(ruleInfo, url, body, artDate){
    var self = this;
    var $ = cheerio.load(body);
    self.oLog.LogDetail.info("["+url+"]  获取文章详情成功");
    self.oCfg.debug && console.info("["+url+"]  获取文章详情成功");
    var title = entities.decode($(ruleInfo.content.title).text());
    var content = entities.decode($(ruleInfo.content.article).html());
    if(!title || !content){
        self.oLog.LogDetail.warn("["+url+"]  文章内容或标题抓取失败，请检查DOM节点规则设置");
        self.oLog.LogDateArt.warn("["+url+"] 文章内容或标题抓取失败，请检查DOM节点规则设置");
        self.oCfg.debug && console.warn("["+url+"]  文章内容或标题抓取失败，请检查DOM节点规则设置");
        return true;
    }
    var category_id = ruleInfo.category_id;
    self.save(url, artDate, title, content, category_id);
};

/**
 * 数据入库
 * @param {type} artDate
 * @param {type} url
 * @param {type} title
 * @param {type} content
 * @param string type 文章类型
 * @returns {undefined}
 */
Robot.prototype.save = function(url, artDate, title, content, category_id){
    var self = this;
    var sql = "INSERT INTO jf_bk_spider (`category_id`, `name`, `content`, `time`) VALUES (?, ?, ?, ?)";
    var inserts = [category_id, title, content, artDate];
    sql = mysql.format(sql, inserts);
    query(sql, function(err, ret, fields){
        if(err){
            self.oLog.LogDetail.error("["+url+"] ["+sql+"]  数据入库失败，失败原因："+err.code+" "+ err.errno);
            self.oLog.LogDateArt.error("["+url+"] ["+sql+"]  数据入库失败，失败原因："+err.code+" "+ err.errno);
            self.oCfg.debug && console.error("["+url+"]  数据入库失败，失败原因："+err.code+" "+ err.errno);
            return true;
        }
        self.oLog.LogDetail.info("["+url+"] ["+ret.insertId+"]  数据入库成功");
        self.oCfg.debug && console.info("["+url+"]  ["+ret.insertId+"]  数据入库成功");
    });  
};

var robot = new Robot();
robot.start();
