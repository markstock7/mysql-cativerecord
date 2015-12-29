# mysql-cactiveRecord
A cAtiveRecord that can help user to easily manipulate record with mysql

var User = CActiveRecord.extend({
 init:function(){},
 tableName : function(){
     return 'mp_user'
 },
 primaryKey : 'user_id',
 rules : function(){
     return {
         'user_username' : ['required','max_length[50]'],
         'user_email'    : ['required','max_length[100]','email'],
         'user_password' : ['required','max_length[100]'],
         'user_url'      : ['max_length[100]', 'valid_url'],
         //'user_update'   : ['required'],
         'user_status'   : ['integer', 'max_length[10]']
     }
 },
 /**
  * 添加数据表单项目，可能木用
  */
 fields : [
     'user_id',
     'user_username',
     'user_email',
     'user_url',
     'user_password',
     'user_profileImageURL',
     'user_salt',
     'user_provider',
     'user_roles',
     'user_update',
     'user_created',
     'user_activation_key',
     'user_status'
 ],
 relations : function(){
     return {
         'user_id' : [1, 'User', 'id']
     }
 },
 /**
  * 保存前计算密令
  */
 beforeSave : function(){
     var password = this.getParam('user_password'),
         user_salt;
     if(password && this.validate.validate('user_password',password) === true){
         salt = crypto.randomBytes(16).toString('base64');
         password = this.hashPassword(password ,salt);
         this.param('user_password', password);
         this.param('user_salt', salt);
     }
 },
 /**
  * 计算密码哈西值
  * @param password
  * @returns {*}
  */
 hashPassword :function(password, salt) {
     if (salt && password) {
         return crypto.pbkdf2Sync(password, new Buffer(salt, 'base64'), 10000, 64).toString('base64');
     } else {
         return password;
     }
 }
});
var user = new User();
user.model.user_password = "mypassword";
user.save({
    user_username: "mark stock",
    user_email: "markstock7@hotmail.com"
}).then(function() {
    console.log(user);
}, console.log)
console.log(user.is(User), user.is(CActiveRecord), user.is(DBase));
