var OAuth = require('oauth').OAuth;

var OauthAuthorization = module.exports.OauthAuthorization = function (key, secret) {
  this.oa= new OAuth(null, null, key, secret, "1.0", null, "HMAC-SHA1");
};

OauthAuthorization.prototype.apply = function (obj) {
  if(typeof obj.headers.Authorization === 'undefined') {
    obj.headers.Authorization = this.oa._buildAuthorizationHeaders(
      this.oa._prepareParameters(null, null, obj.method, obj.url, {})
    );
  }
  return true;
};
