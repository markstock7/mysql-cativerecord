var mysql = require('mysql'),
	_ = require('lodash'),
	Q = require('q');

(function(global){
	var MPClass = (function(){
		var initializing = false, fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;
		var MPClass = function(prop){
			return  MPClass.extend.call(MPClass,prop);
		};
		MPClass.fn = MPClass.prototype = {
			constructor : MPClass,
			// we can add some prototype function in here
			hasattr : function(){},
			getattr : function(){},
			dir : function(){},
			setattr: function(){},
			init:function(){}
		};
		MPClass.extend = function(prop) {
			// 原型链继承
			initializing = true;
			var proto, _super;
			if (this === MPClass) {
				proto = _.extend({},this.fn);
				_super = _.extend({},this.fn);
			} else {
				proto = new this();
				_super = this.prototype;
			}
			initializing = false;
			var setStatic,initFn;
			if('setStatic' in prop){
				setStatic = prop['setStatic'];
				delete prop['setStatic'];
			}
			if(('init' in prop ) && _.isFunction(prop['init'])){
				initFn = prop['init'];
				delete prop['init'];
			} else {
				throw 'Missing init function';
			}

			for (var name in prop) {
				proto[name] = typeof prop[name] == "function" &&
				typeof _super[name] == "function" &&
				fnTest.test(prop[name]) ?
					(function (name, fn) {
						return function () {
							// 保留其原有的_super通同名函数
							var tmp = this._super;
							// 调用其父方法中的同名函数
							this._super = _super[name];
							var ret = fn.apply(this, arguments);
							this._super = tmp;
							return ret;
						};
					})(name, prop[name]) : prop[name];
			}
			// 包装构造函数

			if(!initializing){
				proto.init = (function(){
					return function(){
						_super['init'].apply(this,arguments);
						initFn.apply(this,arguments);
					}
				}());
			}
			function Class() {
				// 构造函数自动运行
				if (!initializing && this.init){
					this.init.apply(this,  _.toArray(arguments));
				}
			}
			/**
			 * 继承父类的静态方法
			 */
			var parent = this.constructor,
				s;
			for(s in parent){
				if(parent.hasOwnProperty(s) && !(s in Class)){
					Class[s] = parent[s];
				}
			}
			/**
			 * 自己的静态方法,不会覆盖从父类继承过来的
			 */
			if(_.isFunction(setStatic)) {
				var statics = setStatic() || {};
				for (s in statics) {
					if (!(s in Class)) {
						Class[s] = statics[s];
					}parent
				}
			}
			Class.prototype = proto;
			Class.constructor = Class;

			Class.extend = arguments.callee;
			return Class;
		};
		return MPClass;
	})();
	global.MPClass = MPClass;
})(global);





//var DBCollection = MPClass(function(){
//	var $data = [],
//		$index = 0,
//		$length = 0;
//	return {
//		init : function(data){
//			$data = data;
//			$index = 0;
//			$length = $data.length;
//		},
//		next : function(fn){},
//		factory : function(data){
//
//		},
//		rewind: function(){
//
//		}
//	}
//});



var Error = 1;

/**
 * Class 基类
 * 定义类数据库连接的初始化,
 * 执行sql，query,并将查询到的数据转换薇DatatHelper类管理，如果有错误则交给DBError来管理
 */
var DBase = MPClass(function(){
	var $sql = '',
		$db = null,
		threadId = -1;
	return {
		init: function () {
			// 初始化数据库连接
			var db = mysql.createConnection(mysqlConfig);
			db.connect(function(err){
				if(err)
					throw 'Can\'t connect to Server';
				threadId = db.threadId;
			});
			db.config.queryFormat = function(query, values){

				if(!values) return query;
				return query.replace(/\:(\w+)/g, function(txt, key){
					if(values.hasOwnProperty(key)){
						return this.escape(values[key]);
					}
					return txt;
				}.bind(this));
			};
			$db = db;
		},
		/**
		 *
		 * 创建一个sql命令,同一时间只能执行一条sql
		 *
		 * @param sql
		 */
		createCommand: function (sql) {
			if (sql && _.isString(sql))
				$sql = sql;
			else
			// reset $sql;
				$sql = '';
			return this;
		},
		/**
		 *
		 * 执行一个sql,返回操作函数
		 *
		 * @return
		 */
		execute: function (params) {
			var defer = Q.defer();
			if($sql){
				$db.query($sql , params ,function(err, rows){
					if(err)
						defer.reject(err);
					else {
						if(/^(delete|update)/i.test($sql)){
							defer.resolve(rows.affectedRows);
						} else if (rows.insertId) {
							defer.resolve(rows.insertId);
						}
						else
							defer.resolve(rows.length);
					}
				});
			} else {
				process.nextTick(function(){
					defer.reject({code:Error,msg:'There isn\'t a sql that we can execute'});
				});
			}
			return defer.promise;
		},
		/**
		 * 执行一条查询 sql
		 * @param params array 查询数据
		 * @param flag boolean true返回第一条,false返回所有
		 * @returns {*}
		 */
		query: function (params, flag) {
			var defer = Q.defer();
			if($sql){
				params = _.isPlainObject(params) ? params : {};
				$db.query($sql, params, function(err, rows, fields){
					if(err) defer.reject(err);
					if(flag === true)
						if(rows.length>0)
							defer.resolve(rows[0]);
						else
							defer.resolve('wrong');
					else {
						defer.resolve(rows);
					}
				});
			} else {
				process.nextTick(function(){
					defer.reject({code:Error,msg:'There isn\'t a sql that we can query'});
				});
			}
			return defer.promise;
		},
		/**
		 *  查询并返回结果中的所有行
		 * @param params
		 * @returns {*}
		 */
		queryAll: function (params) {
			return this.query(params, false);
		},
		/**
		 * 查询并返回结果中的第一行
		 * @param params
		 * @returns {*}
		 */
		queryRow: function (params) {
			return this.query(params, true)
		},
		ping : function(){
			var defer = Q.defer();
			db.ping(function(err){
				if(err) defer.reject(err);
				else
					defer.resolve(true);
			});
			return defer.promise;
		}
	}
}());


var DBValidate = MPClass(function(){
	var messages = {
		required: 'The %s field is required.',
		matches: 'The %s field does not match the %s field.',
		valid_email: 'The %s field must contain a valid email address.',
		min_length: 'The %s field must be at least %s characters in length.',
		max_length: 'The %s field must not exceed %s characters in length.',
		exact_length: 'The %s field must be exactly %s characters in length.',
		greater_than: 'The %s field must contain a number greater than %s.',
		less_than: 'The %s field must contain a number less than %s.',
		alpha: 'The %s field must only contain alphabetical characters.',
		alpha_numeric: 'The %s field must only contain alpha-numeric characters.',
		alpha_dash: 'The %s field must only contain alpha-numeric characters, underscores, and dashes.',
		numeric: 'The %s field must contain only numbers.',
		integer: 'The %s field must contain an integer.',
		decimal: 'The %s field must contain a decimal number.',
		is_natural: 'The %s field must contain only positive numbers.',
		is_natural_no_zero: 'The %s field must contain a number greater than zero.',
		valid_ip: 'The %s field must contain a valid IP.',
		valid_base64: 'The %s field must contain a base64 string.',
		valid_url: 'The %s field must contain a valid URL.',
		greater_than_date: 'The %s field must contain a more recent date than %s.',
		less_than_date: 'The %s field must contain an older date than %s.',
		greater_than_or_equal_date: 'The %s field must contain a date that\'s at least as recent as %s.',
		less_than_or_equal_date: 'The %s field must contain a date that\'s %s or older.'
	};

	var ruleRegex = /^(.+?)\[(.+)\]$/,
		numericRegex = /^[0-9]+$/,
		integerRegex = /^\-?[0-9]+$/,
		decimalRegex = /^\-?[0-9]*\.?[0-9]+$/,
		emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
		alphaRegex = /^[a-z]+$/i,
		alphaNumericRegex = /^[a-z0-9]+$/i,
		alphaDashRegex = /^[a-z0-9_\-]+$/i,
		naturalRegex = /^[0-9]+$/i,
		naturalNoZeroRegex = /^[1-9][0-9]*$/i,
		ipRegex = /^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})$/i,
		base64Regex = /[^a-zA-Z0-9\/\+=]/i,
		numericDashRegex = /^[\d\-\s]+$/,
		urlRegex = /^((http|https):\/\/(\w+:{0,1}\w*@)?(\S+)|)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/,
		dateRegex = /\d{4}-\d{1,2}-\d{1,2}/;

	var _hooks = {
		required : function(value) {
			return value !== null && value !== '';
		},
		valid_email : function(value){
			return emailRegex.test(value);
		},
		min_length : function(value, length){
			if(!numericRegex.test(length))
				return false;
			return value.length >= parseInt(length, 10);
		},
		max_length : function(value, length){
			if(!numericRegex.test(length))
				return false;
			return value.length <= parseInt(length, 10);
		},
		exact_length : function(value, lenght){
			if(!numericRegex.test(length))
				return false;
			return value.length === parseInt(length, 10);
		},
		greater_than : function(value, param){
			if(!decimalRegex.test(value))
				return false;
			return (parseFloat(value) > parseFloat(param));
		},
		less_than : function(value, param){
			if(!decimalRegex.test(value))
				return false;
			return (parseFloat(value) < parseFloat(param));
		},
		alpha : function(value){
			return alphaRegex.test(value);
		},
		alpha_numeric : function(value){
			return (alphaNumericRegex.test(value));
		},
		alpha_dash : function(value){
			return alphaDashRegex.test(value);
		},
		numeric : function(value){
			return numericRegex.test(value);
		},
		integer : function(value){
			return integerRegex.test(value);
		},
		decimal : function(value){
			return decimalRegex.test(value);
		},
		is_natural : function(value){
			return naturalRegex.test(value);
		},
		is_natural_no_zero: function(value) {
			return (naturalNoZeroRegex.test(value.value));
		},

		valid_ip: function(value) {
			return (ipRegex.test(value.value));
		},

		valid_base64: function(value) {
			return (base64Regex.test(value.value));
		},

		valid_url: function(value) {
			return (urlRegex.test(value.value));
		},
		greater_than_date: function (value, date) {
			var enteredDate = this._getValidDate(value),
				validDate = this._getValidDate(date);

			if (!validDate || !enteredDate) {
				return false;
			}

			return enteredDate > validDate;
		},

		less_than_date: function (value, date) {
			var enteredDate = this._getValidDate(value),
				validDate = this._getValidDate(date);

			if (!validDate || !enteredDate) {
				return false;
			}

			return enteredDate < validDate;
		},

		greater_than_or_equal_date: function (value, date) {
			var enteredDate = this._getValidDate(value),
				validDate = this._getValidDate(date);

			if (!validDate || !enteredDate) {
				return false;
			}

			return enteredDate >= validDate;
		},

		less_than_or_equal_date: function (value, date) {
			var enteredDate = this._getValidDate(value),
				validDate = this._getValidDate(date);

			if (!validDate || !enteredDate) {
				return false;
			}

			return enteredDate <= validDate;
		}


	};

	return {
		setStatic: function () {

		},
		init: function (rules) {
			this.rules = rules;
		},
		/**
		 * 检查某项是否满足rules
		 * @param name
		 * @param value
		 * @returns {*}
		 */
		validate: function (name, value) {
			var rules = this.rules[name],
				rule,
				failed = false,
				parts,
				param;
			if (!rules)
				return true;
			else {
				var indexOfRequired = rules.indexOf('required'),
					isEmpty = (!value || value === '' || value === undefined);
				for (var i = 0, len = rules.length; i < len; i++) {
					rule = rules[i];
					failed = false;
					parts = ruleRegex.exec(rule);
					if(indexOfRequired === -1 && isEmpty) continue;

					if(parts) {
						rule = parts[1];
						param = parts[2];
					}

					if(typeof _hooks[rule] === 'function'){
						if(!_hooks[rule].apply(this, [value, param]))
							failed = true;
					} else {
						// 如果没有则略过，后期可能加上回调函数
						continue;
					}

					if(failed) {
						var source = messages[rule],
							message = 'An error has occurred with the' + name + 'field';
						if(source){
							message = message.replace('%s' ,rule);
							if(parts)
								message = message.replace('%s', param);
						}
						return message;
					}
				}
				return !failed;
			}
		},
		/**
		 *
		 * @param params
		 * @returns {{field: string, msg: *}}
		 */
		all: function (params) {
			var valid,
				name,
				value,
				item;
			for(item in this.rules){
				name = item;
				value = params[name];
				if((valid = this.validate(name, value)) !== true)
					return {field: name ,msg: valid};
			}
			return true;
		},
		some : function(params){
			var valid,name,value;
			for(name in params){
				value = params[name];
				if((valid = this.validate(name,value)) !== true)
					return {field:name, msg:valid};
			}
			return true;
		},
		_getValidDate : function(date) {
			if (!date.match('today') && !date.match(dateRegex)) {
				return false;
			}

			var validDate = new Date(),
				validDateArray;

			if (!date.match('today')) {
				validDateArray = date.split('-');
				validDate.setFullYear(validDateArray[0]);
				validDate.setMonth(validDateArray[1] - 1);
				validDate.setDate(validDateArray[2]);
			}
			return validDate;
		}
	}
}());

// TODO
var SQLBuilder =DBase.extend({
	init: function(){},

	/**
	 * The following function is SQLBuilder
	 */
	where: function(){

	},
	limit: function(){

	},
	count: function(){

	},
	orderBy: function(){

	},
	countBy: function(condition){

	},
	and: function(){

	},
	or: function(){

	},
	between : function(){

	},
	join: function(){

	},
	leftjoin: function(){

	},
	rightjoin: function(){

	},
	from: function() {

	},
	drag: function(){

	}
});


/**
 * 基于Dase的sql封装，将数据查询转换为真正的sql交给DBase来处理，并调用DBValidate来检查数据的合法性。
 * 每个CAtiveRecord 都保存一个 DBValidate的实例，
 */
//var CActiveRecord
module.exports= DBase.extend(function(){
	var insertQuery = 'INSERT INTO :table (:params) VALUES (:values)',
		updateQuery = 'UPDATE :table SET :changes WHERE :condition',
		deleteQuery = 'DELETE FROM :table WHERE ',
		selectQuery = 'SELECT :params FROM :table WHERE :condition';
	/**
	 * 处理错误promise
	 * @param msg 错误信息
	 * @returns {*}
	 */
	function badQ(msg){
		var defer = Q.defer();
		process.nextTick(function(){defer.reject(msg)});
		return defer;
	}
	return {
		/**
		 * 静态函数构造器
		 */
		setStatic : function(){
			return {
				/**
				 * 根据条件查询所有数据的实例
				 * @param param 查询项，查询条件
				 * @param condition
				 * @returns {*}
				 */
				findAll : function(param, condition){
					if (!_.isArray(param)) {
						condition = param;
						param = ['*'];
					}
					// 生成实例
					var instance = new this(),
						cls = this;
					if (!condition)
						condition = 1;
					if (!param) param = ['*'];
					// 验证condition
					if (instance.validate.validate(condition))
						condition = instance.validate.toString(condition);
					var sql = selectQuery.replace(/:params/, param.join(','))
						.replace(/:table/, instance.tableName())
						.replace(/:condition/, _.map(_.keys(condition),function(v){return v+'=:'+v}).join(' and '));
					var defer = Q.defer();
					instance.createCommand(sql).query(condition).then(function(data){
						var instances = [];
						for(var i = 0, len = data.length; i < len; i++){
							if(instance = new cls())
								_.map(data[i], function (value, key) {
									if (instance.getParam(key)) {
										instance.delParam(key);
									}
									instance.model[key] = [value, 0];
									instance.assignParam(key, [value, 0]);
								});
							instances.push(instance);
							instance = null;
						}
						defer.resolve(instances);
					},function(err){defer.reject(err)});
					return defer.promise;
				},
				/**
				 * 根据条件查询一条数据的实例
				 * @param param 查询项，查询条件
				 * @param condition
				 * @returns {*}
				 */
				findOne : function(param, condition){
					if (!_.isArray(param)) {
						condition = param;
						param = ['*'];
					}
					// 生成实例
					var cls = this,
						instance = new cls(),
						valid,
						defer = Q.defer();
					if (!condition) condition = 1;
					if (!param) param = ['*'];
					if ((valid = instance.validate.some(condition)) !== true){
						defer.reject(valid);
					} else {
						var sql = selectQuery.replace(/:params/, param.join(','))
							.replace(/:table/, instance.tableName())
							.replace(/:condition/, _.map(_.keys(condition), function (v) {
								return v + '=:' + v
							}).join(' and '));

						instance.createCommand(sql).query(condition).then(function (data) {
							if (data.length === 0) {
								defer.resolve(null);
							} else {
								_.map(data[0], function (value, key) {
									if (instance.getParam(key)) {
										instance.delParam(key);
									}
									instance.model[key] = [value, 0];
									instance.assignParam(key, [value, 0]);
								});
								instance["$id"] = data[0][instance.primaryKey];
								defer.resolve(instance);
							}
						}, function (err) {
							defer.reject(err)
						});
					}
					return defer.promise;
				}
			}
		},
		/**
		 * 构造函数
		 */
		init: function() {
			// 对rules进行解析，生成验证规则
			this.validate = new DBValidate(this.rules());
			this.model = {};
		},
		param : function(name, value, fn){
			if(_.isFunction(fn))
				value = fn(value);
			var msg;
			//对value进行检查，并做些处理
			if(this.fields.indexOf(name) && (msg = this.validate.validate(name,value)) === true){
				this.model[name] = [value, 1];
			} else
				throw msg;
		},
		getParam : function(name){
			if(name in this.model && this.model.hasOwnProperty(name))
				return this.model[name];
			else
				return null;
		},
		delParam: function(name){
			delete this.model[name];
		},
		assignParam : function(name,value){
			this.model[name] = value;
		},
		save: function (attributes) {
			if(_.isFunction(this.beforeSave))
				this.beforeSave();

			if(this.$id === null || this.$id === undefined)
				return this.insert(attributes);
			else
				return this.update(attributes);
		},
		insert : function(attributes){
			var msg, key, params ={}, i= 0, defer = Q.defer();
			for(key in attributes){
				// can't assign rpimath key
				if(key === this.primaryKey) delete attributes[key];
				attributes[key] = [attributes[key], 1];
			}
			_.extend(this.model, attributes);
			console.log(this.model);
			// 将数据整合进model
			for(key in this.model){
				if(key !== this.primaryKey && this.model[key][1] !== 0) {
					params[key] = this.model[key][0];
					i++;
				}
			}

			if((msg = this.validate.all(params)) === true){
				// 所有数据都通过检查,开始生成sql
				var values = [];
				for(var value in params){
					value = params[value];
					if(typeof value === 'string'){
						values.push('\"' + value +'\"');
					} else
						values.push(value);
				}

				var sql = insertQuery.replace(/:table/, this.tableName())
					.replace(/:params/, _.keys(params).join(','))
					.replace(/:values/, _.map(_.keys(params),function(v){return ':'+v}).join(','));
				var that = this;
				this.createCommand(sql).execute(params).then(function(data){
					for(value in that.model){
						that.model[value][1] = 0;
					}
					that.$id = data;
					defer.resolve(data);
				},function(err){defer.reject(err)});
			} else {
				process.nextTick(function(){defer.reject(msg)});
			}
			return defer.promise;
		},
		/**
		 *
		 * update 当前的实例
		 *
		 * @param attribute
		 * @returns {*}
		 */
		update : function(attributes){
			var msg, key, params =[], i= 0, defer = Q.defer();
			if(!attributes) attributes = {};
			for(key in attributes){
				if(key === this.primaryKey) continue;
				this.param(key,attributes[key]);
			}
			// 合并修改项目
			for(key in this.model){
				if(key !== this.primaryKey && this.model[key][1] !== 0) {
					params[key] = this.model[key][0];
					i++;
				}
			}
			if(i > 0) {
				var sql = updateQuery.replace(/:table/, this.tableName())
					.replace(/:params/, _.keys(params).join(','))
					.replace(/:changes/,  _.map(_.keys(params),function(v){return v+'=:'+v}).join(','))
					.replace(/:condition/, this.primaryKey+'='+this.$id);
				var that = this;
				this.createCommand(sql).execute(params).then(function(num){
					for(key in that.model){
						if(key !== that.primaryKey && that.model[key][1] !== 0) {
							that.model[key][1] = 1;
						}
					}
					defer.resolve(num);
				},function(err){
					defer.reject(err);
				});
			} else {
				process.nextTick(function(){defer.reject('there is nothing to update')});
			}
			return defer.promise;
		},
		mdelete : function(){
			if(this.$id){
				var defer = Q.defer(),that = this;
				var sql = deleteQuery.replace(/:table/,this.tableName()) + this.primaryKey + '=' +this.$id;
				this.createCommand(sql).execute().then(function(num){
					defer.resolve(num);
					that.$id = null;
				},function(err){
					defer.reject(err);
				});
				return defer.promise;
			} else {
				return badQ({msg:'the id is not specified assign'});
			}
		},
		/** 虚方法 */
		tableName: function () {
			return '';
		},
		stringOf: function(){
			var data = {};
			for(var name in this.model){
				data[name] = this.model[name][0];
			}
			return data;
		}
	}
}());



//var User = CActiveRecord.extend({
//	init:function(){},
//	tableName : function(){
//		return 'mp_user'
//	},
//	primaryKey : 'user_id',
//	rules : function(){
//		return {
//			'user_username' : ['required','max_length[50]'],
//			'user_email'    : ['required','max_length[100]','email'],
//			'user_password' : ['required','max_length[100]'],
//			'user_url'      : ['max_length[100]', 'valid_url'],
//			//'user_update'   : ['required'],
//			'user_status'   : ['integer', 'max_length[10]']
//		}
//	},
//	/**
//	 * 添加数据表单项目，可能木用
//	 */
//	fields : [
//		'user_id',
//		'user_username',
//		'user_email',
//		'user_url',
//		'user_password',
//		'user_profileImageURL',
//		'user_salt',
//		'user_provider',
//		'user_roles',
//		'user_update',
//		'user_created',
//		'user_activation_key',
//		'user_status'
//	],
//	relations : function(){
//		return {
//			'user_id' : [1, 'User', 'id']
//		}
//	},
//	/**
//	 * 保存前计算密令
//	 */
//	beforeSave : function(){
//		var password = this.getParam('user_password'),
//			user_salt;
//		if(password && this.validate.validate('user_password',password) === true){
//			salt = crypto.randomBytes(16).toString('base64');
//			password = this.hashPassword(password ,salt);
//			this.param('user_password', password);
//			this.param('user_salt', salt);
//		}
//	},
//	/**
//	 * 计算密码哈西值
//	 * @param password
//	 * @returns {*}
//	 */
//	hashPassword :function(password, salt) {
//		if (salt && password) {
//			return crypto.pbkdf2Sync(password, new Buffer(salt, 'base64'), 10000, 64).toString('base64');
//		} else {
//			return password;
//		}
//	}
//});
//var user = new User();
////user.model.user_password = "whmjack1994"
////user.save({
////	user_username :"markstlsdjfs",
////	user_email : "markstock7@hotmail.com"
////}).then(function(){
////	console.log(user);
////},console.log)
////console.log(user.is(User), user.is(CActiveRecord), user.is(DBase));

