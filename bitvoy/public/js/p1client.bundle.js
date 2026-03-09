// p1client bundle for browser (includes @silencelaboratories/ecdsa-tss)

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod2) => function __require() {
  return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));

// (disabled):crypto
var require_crypto = __commonJS({
  "(disabled):crypto"() {
  }
});

// node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "node_modules/base64-js/index.js"(exports) {
    "use strict";
    exports.byteLength = byteLength;
    exports.toByteArray = toByteArray;
    exports.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i3 = 0, len = code.length; i3 < len; ++i3) {
      lookup[i3] = code[i3];
      revLookup[code.charCodeAt(i3)] = i3;
    }
    var i3;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1)
        validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i4;
      for (i4 = 0; i4 < len2; i4 += 4) {
        tmp = revLookup[b64.charCodeAt(i4)] << 18 | revLookup[b64.charCodeAt(i4 + 1)] << 12 | revLookup[b64.charCodeAt(i4 + 2)] << 6 | revLookup[b64.charCodeAt(i4 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i4)] << 2 | revLookup[b64.charCodeAt(i4 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i4)] << 10 | revLookup[b64.charCodeAt(i4 + 1)] << 4 | revLookup[b64.charCodeAt(i4 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i4 = start; i4 < end; i4 += 3) {
        tmp = (uint8[i4] << 16 & 16711680) + (uint8[i4 + 1] << 8 & 65280) + (uint8[i4 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i4 = 0, len22 = len2 - extraBytes; i4 < len22; i4 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i4, i4 + maxChunkLength > len22 ? len22 : i4 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "node_modules/ieee754/index.js"(exports) {
    exports.read = function(buffer, offset, isLE, mLen, nBytes) {
      var e3, m2;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i3 = isLE ? nBytes - 1 : 0;
      var d2 = isLE ? -1 : 1;
      var s2 = buffer[offset + i3];
      i3 += d2;
      e3 = s2 & (1 << -nBits) - 1;
      s2 >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e3 = e3 * 256 + buffer[offset + i3], i3 += d2, nBits -= 8) {
      }
      m2 = e3 & (1 << -nBits) - 1;
      e3 >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m2 = m2 * 256 + buffer[offset + i3], i3 += d2, nBits -= 8) {
      }
      if (e3 === 0) {
        e3 = 1 - eBias;
      } else if (e3 === eMax) {
        return m2 ? NaN : (s2 ? -1 : 1) * Infinity;
      } else {
        m2 = m2 + Math.pow(2, mLen);
        e3 = e3 - eBias;
      }
      return (s2 ? -1 : 1) * m2 * Math.pow(2, e3 - mLen);
    };
    exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
      var e3, m2, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i3 = isLE ? 0 : nBytes - 1;
      var d2 = isLE ? 1 : -1;
      var s2 = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m2 = isNaN(value) ? 1 : 0;
        e3 = eMax;
      } else {
        e3 = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e3)) < 1) {
          e3--;
          c *= 2;
        }
        if (e3 + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e3++;
          c /= 2;
        }
        if (e3 + eBias >= eMax) {
          m2 = 0;
          e3 = eMax;
        } else if (e3 + eBias >= 1) {
          m2 = (value * c - 1) * Math.pow(2, mLen);
          e3 = e3 + eBias;
        } else {
          m2 = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e3 = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i3] = m2 & 255, i3 += d2, m2 /= 256, mLen -= 8) {
      }
      e3 = e3 << mLen | m2;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i3] = e3 & 255, i3 += d2, e3 /= 256, eLen -= 8) {
      }
      buffer[offset + i3 - d2] |= s2 * 128;
    };
  }
});

// node_modules/buffer/index.js
var require_buffer = __commonJS({
  "node_modules/buffer/index.js"(exports) {
    "use strict";
    var base64 = require_base64_js();
    var ieee754 = require_ieee754();
    var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
    exports.Buffer = Buffer3;
    exports.SlowBuffer = SlowBuffer;
    exports.INSPECT_MAX_BYTES = 50;
    var K_MAX_LENGTH = 2147483647;
    exports.kMaxLength = K_MAX_LENGTH;
    Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
    if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
      );
    }
    function typedArraySupport() {
      try {
        const arr = new Uint8Array(1);
        const proto = { foo: function() {
          return 42;
        } };
        Object.setPrototypeOf(proto, Uint8Array.prototype);
        Object.setPrototypeOf(arr, proto);
        return arr.foo() === 42;
      } catch (e3) {
        return false;
      }
    }
    Object.defineProperty(Buffer3.prototype, "parent", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this))
          return void 0;
        return this.buffer;
      }
    });
    Object.defineProperty(Buffer3.prototype, "offset", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this))
          return void 0;
        return this.byteOffset;
      }
    });
    function createBuffer(length) {
      if (length > K_MAX_LENGTH) {
        throw new RangeError('The value "' + length + '" is invalid for option "size"');
      }
      const buf = new Uint8Array(length);
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function Buffer3(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        if (typeof encodingOrOffset === "string") {
          throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
        }
        return allocUnsafe(arg);
      }
      return from(arg, encodingOrOffset, length);
    }
    Buffer3.poolSize = 8192;
    function from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value)) {
        return fromArrayView(value);
      }
      if (value == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      const valueOf = value.valueOf && value.valueOf();
      if (valueOf != null && valueOf !== value) {
        return Buffer3.from(valueOf, encodingOrOffset, length);
      }
      const b2 = fromObject(value);
      if (b2)
        return b2;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
        return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
      );
    }
    Buffer3.from = function(value, encodingOrOffset, length) {
      return from(value, encodingOrOffset, length);
    };
    Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer3, Uint8Array);
    function assertSize(size) {
      if (typeof size !== "number") {
        throw new TypeError('"size" argument must be of type number');
      } else if (size < 0) {
        throw new RangeError('The value "' + size + '" is invalid for option "size"');
      }
    }
    function alloc(size, fill, encoding) {
      assertSize(size);
      if (size <= 0) {
        return createBuffer(size);
      }
      if (fill !== void 0) {
        return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
      }
      return createBuffer(size);
    }
    Buffer3.alloc = function(size, fill, encoding) {
      return alloc(size, fill, encoding);
    };
    function allocUnsafe(size) {
      assertSize(size);
      return createBuffer(size < 0 ? 0 : checked(size) | 0);
    }
    Buffer3.allocUnsafe = function(size) {
      return allocUnsafe(size);
    };
    Buffer3.allocUnsafeSlow = function(size) {
      return allocUnsafe(size);
    };
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer3.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      const length = byteLength(string, encoding) | 0;
      let buf = createBuffer(length);
      const actual = buf.write(string, encoding);
      if (actual !== length) {
        buf = buf.slice(0, actual);
      }
      return buf;
    }
    function fromArrayLike(array) {
      const length = array.length < 0 ? 0 : checked(array.length) | 0;
      const buf = createBuffer(length);
      for (let i3 = 0; i3 < length; i3 += 1) {
        buf[i3] = array[i3] & 255;
      }
      return buf;
    }
    function fromArrayView(arrayView) {
      if (isInstance(arrayView, Uint8Array)) {
        const copy = new Uint8Array(arrayView);
        return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
      }
      return fromArrayLike(arrayView);
    }
    function fromArrayBuffer(array, byteOffset, length) {
      if (byteOffset < 0 || array.byteLength < byteOffset) {
        throw new RangeError('"offset" is outside of buffer bounds');
      }
      if (array.byteLength < byteOffset + (length || 0)) {
        throw new RangeError('"length" is outside of buffer bounds');
      }
      let buf;
      if (byteOffset === void 0 && length === void 0) {
        buf = new Uint8Array(array);
      } else if (length === void 0) {
        buf = new Uint8Array(array, byteOffset);
      } else {
        buf = new Uint8Array(array, byteOffset, length);
      }
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function fromObject(obj) {
      if (Buffer3.isBuffer(obj)) {
        const len = checked(obj.length) | 0;
        const buf = createBuffer(len);
        if (buf.length === 0) {
          return buf;
        }
        obj.copy(buf, 0, 0, len);
        return buf;
      }
      if (obj.length !== void 0) {
        if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
          return createBuffer(0);
        }
        return fromArrayLike(obj);
      }
      if (obj.type === "Buffer" && Array.isArray(obj.data)) {
        return fromArrayLike(obj.data);
      }
    }
    function checked(length) {
      if (length >= K_MAX_LENGTH) {
        throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
      }
      return length | 0;
    }
    function SlowBuffer(length) {
      if (+length != length) {
        length = 0;
      }
      return Buffer3.alloc(+length);
    }
    Buffer3.isBuffer = function isBuffer(b2) {
      return b2 != null && b2._isBuffer === true && b2 !== Buffer3.prototype;
    };
    Buffer3.compare = function compare(a, b2) {
      if (isInstance(a, Uint8Array))
        a = Buffer3.from(a, a.offset, a.byteLength);
      if (isInstance(b2, Uint8Array))
        b2 = Buffer3.from(b2, b2.offset, b2.byteLength);
      if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b2)) {
        throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
      }
      if (a === b2)
        return 0;
      let x = a.length;
      let y2 = b2.length;
      for (let i3 = 0, len = Math.min(x, y2); i3 < len; ++i3) {
        if (a[i3] !== b2[i3]) {
          x = a[i3];
          y2 = b2[i3];
          break;
        }
      }
      if (x < y2)
        return -1;
      if (y2 < x)
        return 1;
      return 0;
    };
    Buffer3.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer3.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer3.alloc(0);
      }
      let i3;
      if (length === void 0) {
        length = 0;
        for (i3 = 0; i3 < list.length; ++i3) {
          length += list[i3].length;
        }
      }
      const buffer = Buffer3.allocUnsafe(length);
      let pos = 0;
      for (i3 = 0; i3 < list.length; ++i3) {
        let buf = list[i3];
        if (isInstance(buf, Uint8Array)) {
          if (pos + buf.length > buffer.length) {
            if (!Buffer3.isBuffer(buf))
              buf = Buffer3.from(buf);
            buf.copy(buffer, pos);
          } else {
            Uint8Array.prototype.set.call(
              buffer,
              buf,
              pos
            );
          }
        } else if (!Buffer3.isBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        } else {
          buf.copy(buffer, pos);
        }
        pos += buf.length;
      }
      return buffer;
    };
    function byteLength(string, encoding) {
      if (Buffer3.isBuffer(string)) {
        return string.length;
      }
      if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
        return string.byteLength;
      }
      if (typeof string !== "string") {
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
        );
      }
      const len = string.length;
      const mustMatch = arguments.length > 2 && arguments[2] === true;
      if (!mustMatch && len === 0)
        return 0;
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "ascii":
          case "latin1":
          case "binary":
            return len;
          case "utf8":
          case "utf-8":
            return utf8ToBytes(string).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return len * 2;
          case "hex":
            return len >>> 1;
          case "base64":
            return base64ToBytes(string).length;
          default:
            if (loweredCase) {
              return mustMatch ? -1 : utf8ToBytes(string).length;
            }
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.byteLength = byteLength;
    function slowToString(encoding, start, end) {
      let loweredCase = false;
      if (start === void 0 || start < 0) {
        start = 0;
      }
      if (start > this.length) {
        return "";
      }
      if (end === void 0 || end > this.length) {
        end = this.length;
      }
      if (end <= 0) {
        return "";
      }
      end >>>= 0;
      start >>>= 0;
      if (end <= start) {
        return "";
      }
      if (!encoding)
        encoding = "utf8";
      while (true) {
        switch (encoding) {
          case "hex":
            return hexSlice(this, start, end);
          case "utf8":
          case "utf-8":
            return utf8Slice(this, start, end);
          case "ascii":
            return asciiSlice(this, start, end);
          case "latin1":
          case "binary":
            return latin1Slice(this, start, end);
          case "base64":
            return base64Slice(this, start, end);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16leSlice(this, start, end);
          default:
            if (loweredCase)
              throw new TypeError("Unknown encoding: " + encoding);
            encoding = (encoding + "").toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.prototype._isBuffer = true;
    function swap(b2, n3, m2) {
      const i3 = b2[n3];
      b2[n3] = b2[m2];
      b2[m2] = i3;
    }
    Buffer3.prototype.swap16 = function swap16() {
      const len = this.length;
      if (len % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (let i3 = 0; i3 < len; i3 += 2) {
        swap(this, i3, i3 + 1);
      }
      return this;
    };
    Buffer3.prototype.swap32 = function swap32() {
      const len = this.length;
      if (len % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (let i3 = 0; i3 < len; i3 += 4) {
        swap(this, i3, i3 + 3);
        swap(this, i3 + 1, i3 + 2);
      }
      return this;
    };
    Buffer3.prototype.swap64 = function swap64() {
      const len = this.length;
      if (len % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (let i3 = 0; i3 < len; i3 += 8) {
        swap(this, i3, i3 + 7);
        swap(this, i3 + 1, i3 + 6);
        swap(this, i3 + 2, i3 + 5);
        swap(this, i3 + 3, i3 + 4);
      }
      return this;
    };
    Buffer3.prototype.toString = function toString() {
      const length = this.length;
      if (length === 0)
        return "";
      if (arguments.length === 0)
        return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
    Buffer3.prototype.equals = function equals(b2) {
      if (!Buffer3.isBuffer(b2))
        throw new TypeError("Argument must be a Buffer");
      if (this === b2)
        return true;
      return Buffer3.compare(this, b2) === 0;
    };
    Buffer3.prototype.inspect = function inspect() {
      let str = "";
      const max = exports.INSPECT_MAX_BYTES;
      str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
      if (this.length > max)
        str += " ... ";
      return "<Buffer " + str + ">";
    };
    if (customInspectSymbol) {
      Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
    }
    Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
      if (isInstance(target, Uint8Array)) {
        target = Buffer3.from(target, target.offset, target.byteLength);
      }
      if (!Buffer3.isBuffer(target)) {
        throw new TypeError(
          'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
        );
      }
      if (start === void 0) {
        start = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start >= end) {
        return 1;
      }
      start >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target)
        return 0;
      let x = thisEnd - thisStart;
      let y2 = end - start;
      const len = Math.min(x, y2);
      const thisCopy = this.slice(thisStart, thisEnd);
      const targetCopy = target.slice(start, end);
      for (let i3 = 0; i3 < len; ++i3) {
        if (thisCopy[i3] !== targetCopy[i3]) {
          x = thisCopy[i3];
          y2 = targetCopy[i3];
          break;
        }
      }
      if (x < y2)
        return -1;
      if (y2 < x)
        return 1;
      return 0;
    };
    function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
      if (buffer.length === 0)
        return -1;
      if (typeof byteOffset === "string") {
        encoding = byteOffset;
        byteOffset = 0;
      } else if (byteOffset > 2147483647) {
        byteOffset = 2147483647;
      } else if (byteOffset < -2147483648) {
        byteOffset = -2147483648;
      }
      byteOffset = +byteOffset;
      if (numberIsNaN(byteOffset)) {
        byteOffset = dir ? 0 : buffer.length - 1;
      }
      if (byteOffset < 0)
        byteOffset = buffer.length + byteOffset;
      if (byteOffset >= buffer.length) {
        if (dir)
          return -1;
        else
          byteOffset = buffer.length - 1;
      } else if (byteOffset < 0) {
        if (dir)
          byteOffset = 0;
        else
          return -1;
      }
      if (typeof val === "string") {
        val = Buffer3.from(val, encoding);
      }
      if (Buffer3.isBuffer(val)) {
        if (val.length === 0) {
          return -1;
        }
        return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
      } else if (typeof val === "number") {
        val = val & 255;
        if (typeof Uint8Array.prototype.indexOf === "function") {
          if (dir) {
            return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
          } else {
            return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
          }
        }
        return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
      }
      throw new TypeError("val must be string, number or Buffer");
    }
    function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
      let indexSize = 1;
      let arrLength = arr.length;
      let valLength = val.length;
      if (encoding !== void 0) {
        encoding = String(encoding).toLowerCase();
        if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
          if (arr.length < 2 || val.length < 2) {
            return -1;
          }
          indexSize = 2;
          arrLength /= 2;
          valLength /= 2;
          byteOffset /= 2;
        }
      }
      function read(buf, i4) {
        if (indexSize === 1) {
          return buf[i4];
        } else {
          return buf.readUInt16BE(i4 * indexSize);
        }
      }
      let i3;
      if (dir) {
        let foundIndex = -1;
        for (i3 = byteOffset; i3 < arrLength; i3++) {
          if (read(arr, i3) === read(val, foundIndex === -1 ? 0 : i3 - foundIndex)) {
            if (foundIndex === -1)
              foundIndex = i3;
            if (i3 - foundIndex + 1 === valLength)
              return foundIndex * indexSize;
          } else {
            if (foundIndex !== -1)
              i3 -= i3 - foundIndex;
            foundIndex = -1;
          }
        }
      } else {
        if (byteOffset + valLength > arrLength)
          byteOffset = arrLength - valLength;
        for (i3 = byteOffset; i3 >= 0; i3--) {
          let found = true;
          for (let j = 0; j < valLength; j++) {
            if (read(arr, i3 + j) !== read(val, j)) {
              found = false;
              break;
            }
          }
          if (found)
            return i3;
        }
      }
      return -1;
    }
    Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    function hexWrite(buf, string, offset, length) {
      offset = Number(offset) || 0;
      const remaining = buf.length - offset;
      if (!length) {
        length = remaining;
      } else {
        length = Number(length);
        if (length > remaining) {
          length = remaining;
        }
      }
      const strLen = string.length;
      if (length > strLen / 2) {
        length = strLen / 2;
      }
      let i3;
      for (i3 = 0; i3 < length; ++i3) {
        const parsed = parseInt(string.substr(i3 * 2, 2), 16);
        if (numberIsNaN(parsed))
          return i3;
        buf[offset + i3] = parsed;
      }
      return i3;
    }
    function utf8Write(buf, string, offset, length) {
      return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
    }
    function asciiWrite(buf, string, offset, length) {
      return blitBuffer(asciiToBytes(string), buf, offset, length);
    }
    function base64Write(buf, string, offset, length) {
      return blitBuffer(base64ToBytes(string), buf, offset, length);
    }
    function ucs2Write(buf, string, offset, length) {
      return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
    }
    Buffer3.prototype.write = function write(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset >>> 0;
        if (isFinite(length)) {
          length = length >>> 0;
          if (encoding === void 0)
            encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      const remaining = this.length - offset;
      if (length === void 0 || length > remaining)
        length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding)
        encoding = "utf8";
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
          case "latin1":
          case "binary":
            return asciiWrite(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase)
              throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer3.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    function base64Slice(buf, start, end) {
      if (start === 0 && end === buf.length) {
        return base64.fromByteArray(buf);
      } else {
        return base64.fromByteArray(buf.slice(start, end));
      }
    }
    function utf8Slice(buf, start, end) {
      end = Math.min(buf.length, end);
      const res = [];
      let i3 = start;
      while (i3 < end) {
        const firstByte = buf[i3];
        let codePoint = null;
        let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
        if (i3 + bytesPerSequence <= end) {
          let secondByte, thirdByte, fourthByte, tempCodePoint;
          switch (bytesPerSequence) {
            case 1:
              if (firstByte < 128) {
                codePoint = firstByte;
              }
              break;
            case 2:
              secondByte = buf[i3 + 1];
              if ((secondByte & 192) === 128) {
                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                if (tempCodePoint > 127) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 3:
              secondByte = buf[i3 + 1];
              thirdByte = buf[i3 + 2];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 4:
              secondByte = buf[i3 + 1];
              thirdByte = buf[i3 + 2];
              fourthByte = buf[i3 + 3];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                  codePoint = tempCodePoint;
                }
              }
          }
        }
        if (codePoint === null) {
          codePoint = 65533;
          bytesPerSequence = 1;
        } else if (codePoint > 65535) {
          codePoint -= 65536;
          res.push(codePoint >>> 10 & 1023 | 55296);
          codePoint = 56320 | codePoint & 1023;
        }
        res.push(codePoint);
        i3 += bytesPerSequence;
      }
      return decodeCodePointsArray(res);
    }
    var MAX_ARGUMENTS_LENGTH = 4096;
    function decodeCodePointsArray(codePoints) {
      const len = codePoints.length;
      if (len <= MAX_ARGUMENTS_LENGTH) {
        return String.fromCharCode.apply(String, codePoints);
      }
      let res = "";
      let i3 = 0;
      while (i3 < len) {
        res += String.fromCharCode.apply(
          String,
          codePoints.slice(i3, i3 += MAX_ARGUMENTS_LENGTH)
        );
      }
      return res;
    }
    function asciiSlice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i3 = start; i3 < end; ++i3) {
        ret += String.fromCharCode(buf[i3] & 127);
      }
      return ret;
    }
    function latin1Slice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i3 = start; i3 < end; ++i3) {
        ret += String.fromCharCode(buf[i3]);
      }
      return ret;
    }
    function hexSlice(buf, start, end) {
      const len = buf.length;
      if (!start || start < 0)
        start = 0;
      if (!end || end < 0 || end > len)
        end = len;
      let out = "";
      for (let i3 = start; i3 < end; ++i3) {
        out += hexSliceLookupTable[buf[i3]];
      }
      return out;
    }
    function utf16leSlice(buf, start, end) {
      const bytes = buf.slice(start, end);
      let res = "";
      for (let i3 = 0; i3 < bytes.length - 1; i3 += 2) {
        res += String.fromCharCode(bytes[i3] + bytes[i3 + 1] * 256);
      }
      return res;
    }
    Buffer3.prototype.slice = function slice(start, end) {
      const len = this.length;
      start = ~~start;
      end = end === void 0 ? len : ~~end;
      if (start < 0) {
        start += len;
        if (start < 0)
          start = 0;
      } else if (start > len) {
        start = len;
      }
      if (end < 0) {
        end += len;
        if (end < 0)
          end = 0;
      } else if (end > len) {
        end = len;
      }
      if (end < start)
        end = start;
      const newBuf = this.subarray(start, end);
      Object.setPrototypeOf(newBuf, Buffer3.prototype);
      return newBuf;
    };
    function checkOffset(offset, ext, length) {
      if (offset % 1 !== 0 || offset < 0)
        throw new RangeError("offset is not uint");
      if (offset + ext > length)
        throw new RangeError("Trying to access beyond buffer length");
    }
    Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert)
        checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i3 = 0;
      while (++i3 < byteLength2 && (mul *= 256)) {
        val += this[offset + i3] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        checkOffset(offset, byteLength2, this.length);
      }
      let val = this[offset + --byteLength2];
      let mul = 1;
      while (byteLength2 > 0 && (mul *= 256)) {
        val += this[offset + --byteLength2] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
      const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
      return BigInt(lo) + (BigInt(hi) << BigInt(32));
    });
    Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
      return (BigInt(hi) << BigInt(32)) + BigInt(lo);
    });
    Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert)
        checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i3 = 0;
      while (++i3 < byteLength2 && (mul *= 256)) {
        val += this[offset + i3] * mul;
      }
      mul *= 128;
      if (val >= mul)
        val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert)
        checkOffset(offset, byteLength2, this.length);
      let i3 = byteLength2;
      let mul = 1;
      let val = this[offset + --i3];
      while (i3 > 0 && (mul *= 256)) {
        val += this[offset + --i3] * mul;
      }
      mul *= 128;
      if (val >= mul)
        val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128))
        return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 2, this.length);
      const val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 2, this.length);
      const val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
      return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
    });
    Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = (first << 24) + // Overflow
      this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
    });
    Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, true, 23, 4);
    };
    Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, false, 23, 4);
    };
    Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, true, 52, 8);
    };
    Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert)
        checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, false, 52, 8);
    };
    function checkInt(buf, value, offset, ext, max, min) {
      if (!Buffer3.isBuffer(buf))
        throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value > max || value < min)
        throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length)
        throw new RangeError("Index out of range");
    }
    Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let mul = 1;
      let i3 = 0;
      this[offset] = value & 255;
      while (++i3 < byteLength2 && (mul *= 256)) {
        this[offset + i3] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let i3 = byteLength2 - 1;
      let mul = 1;
      this[offset + i3] = value & 255;
      while (--i3 >= 0 && (mul *= 256)) {
        this[offset + i3] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 1, 255, 0);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset + 3] = value >>> 24;
      this[offset + 2] = value >>> 16;
      this[offset + 1] = value >>> 8;
      this[offset] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    function wrtBigUInt64LE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      return offset;
    }
    function wrtBigUInt64BE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset + 7] = lo;
      lo = lo >> 8;
      buf[offset + 6] = lo;
      lo = lo >> 8;
      buf[offset + 5] = lo;
      lo = lo >> 8;
      buf[offset + 4] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset + 3] = hi;
      hi = hi >> 8;
      buf[offset + 2] = hi;
      hi = hi >> 8;
      buf[offset + 1] = hi;
      hi = hi >> 8;
      buf[offset] = hi;
      return offset + 8;
    }
    Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i3 = 0;
      let mul = 1;
      let sub = 0;
      this[offset] = value & 255;
      while (++i3 < byteLength2 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i3 - 1] !== 0) {
          sub = 1;
        }
        this[offset + i3] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i3 = byteLength2 - 1;
      let mul = 1;
      let sub = 0;
      this[offset + i3] = value & 255;
      while (--i3 >= 0 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i3 + 1] !== 0) {
          sub = 1;
        }
        this[offset + i3] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 1, 127, -128);
      if (value < 0)
        value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 4, 2147483647, -2147483648);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      this[offset + 2] = value >>> 16;
      this[offset + 3] = value >>> 24;
      return offset + 4;
    };
    Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert)
        checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0)
        value = 4294967295 + value + 1;
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    function checkIEEE754(buf, value, offset, ext, max, min) {
      if (offset + ext > buf.length)
        throw new RangeError("Index out of range");
      if (offset < 0)
        throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
      }
      ieee754.write(buf, value, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    function writeDouble(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
      }
      ieee754.write(buf, value, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
    };
    Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
      if (!Buffer3.isBuffer(target))
        throw new TypeError("argument should be a Buffer");
      if (!start)
        start = 0;
      if (!end && end !== 0)
        end = this.length;
      if (targetStart >= target.length)
        targetStart = target.length;
      if (!targetStart)
        targetStart = 0;
      if (end > 0 && end < start)
        end = start;
      if (end === start)
        return 0;
      if (target.length === 0 || this.length === 0)
        return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start < 0 || start >= this.length)
        throw new RangeError("Index out of range");
      if (end < 0)
        throw new RangeError("sourceEnd out of bounds");
      if (end > this.length)
        end = this.length;
      if (target.length - targetStart < end - start) {
        end = target.length - targetStart + start;
      }
      const len = end - start;
      if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
        this.copyWithin(targetStart, start, end);
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start, end),
          targetStart
        );
      }
      return len;
    };
    Buffer3.prototype.fill = function fill(val, start, end, encoding) {
      if (typeof val === "string") {
        if (typeof start === "string") {
          encoding = start;
          start = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        if (val.length === 1) {
          const code = val.charCodeAt(0);
          if (encoding === "utf8" && code < 128 || encoding === "latin1") {
            val = code;
          }
        }
      } else if (typeof val === "number") {
        val = val & 255;
      } else if (typeof val === "boolean") {
        val = Number(val);
      }
      if (start < 0 || this.length < start || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start) {
        return this;
      }
      start = start >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val)
        val = 0;
      let i3;
      if (typeof val === "number") {
        for (i3 = start; i3 < end; ++i3) {
          this[i3] = val;
        }
      } else {
        const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
        const len = bytes.length;
        if (len === 0) {
          throw new TypeError('The value "' + val + '" is invalid for argument "value"');
        }
        for (i3 = 0; i3 < end - start; ++i3) {
          this[i3 + start] = bytes[i3 % len];
        }
      }
      return this;
    };
    var errors = {};
    function E(sym, getMessage, Base) {
      errors[sym] = class NodeError extends Base {
        constructor() {
          super();
          Object.defineProperty(this, "message", {
            value: getMessage.apply(this, arguments),
            writable: true,
            configurable: true
          });
          this.name = `${this.name} [${sym}]`;
          this.stack;
          delete this.name;
        }
        get code() {
          return sym;
        }
        set code(value) {
          Object.defineProperty(this, "code", {
            configurable: true,
            enumerable: true,
            value,
            writable: true
          });
        }
        toString() {
          return `${this.name} [${sym}]: ${this.message}`;
        }
      };
    }
    E(
      "ERR_BUFFER_OUT_OF_BOUNDS",
      function(name) {
        if (name) {
          return `${name} is outside of buffer bounds`;
        }
        return "Attempt to access memory outside buffer bounds";
      },
      RangeError
    );
    E(
      "ERR_INVALID_ARG_TYPE",
      function(name, actual) {
        return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
      },
      TypeError
    );
    E(
      "ERR_OUT_OF_RANGE",
      function(str, range, input) {
        let msg = `The value of "${str}" is out of range.`;
        let received = input;
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
          received = addNumericalSeparator(String(input));
        } else if (typeof input === "bigint") {
          received = String(input);
          if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
            received = addNumericalSeparator(received);
          }
          received += "n";
        }
        msg += ` It must be ${range}. Received ${received}`;
        return msg;
      },
      RangeError
    );
    function addNumericalSeparator(val) {
      let res = "";
      let i3 = val.length;
      const start = val[0] === "-" ? 1 : 0;
      for (; i3 >= start + 4; i3 -= 3) {
        res = `_${val.slice(i3 - 3, i3)}${res}`;
      }
      return `${val.slice(0, i3)}${res}`;
    }
    function checkBounds(buf, offset, byteLength2) {
      validateNumber(offset, "offset");
      if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
        boundsError(offset, buf.length - (byteLength2 + 1));
      }
    }
    function checkIntBI(value, min, max, buf, offset, byteLength2) {
      if (value > max || value < min) {
        const n3 = typeof min === "bigint" ? "n" : "";
        let range;
        if (byteLength2 > 3) {
          if (min === 0 || min === BigInt(0)) {
            range = `>= 0${n3} and < 2${n3} ** ${(byteLength2 + 1) * 8}${n3}`;
          } else {
            range = `>= -(2${n3} ** ${(byteLength2 + 1) * 8 - 1}${n3}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n3}`;
          }
        } else {
          range = `>= ${min}${n3} and <= ${max}${n3}`;
        }
        throw new errors.ERR_OUT_OF_RANGE("value", range, value);
      }
      checkBounds(buf, offset, byteLength2);
    }
    function validateNumber(value, name) {
      if (typeof value !== "number") {
        throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
      }
    }
    function boundsError(value, length, type) {
      if (Math.floor(value) !== value) {
        validateNumber(value, type);
        throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
      }
      if (length < 0) {
        throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
      }
      throw new errors.ERR_OUT_OF_RANGE(
        type || "offset",
        `>= ${type ? 1 : 0} and <= ${length}`,
        value
      );
    }
    var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
    function base64clean(str) {
      str = str.split("=")[0];
      str = str.trim().replace(INVALID_BASE64_RE, "");
      if (str.length < 2)
        return "";
      while (str.length % 4 !== 0) {
        str = str + "=";
      }
      return str;
    }
    function utf8ToBytes(string, units) {
      units = units || Infinity;
      let codePoint;
      const length = string.length;
      let leadSurrogate = null;
      const bytes = [];
      for (let i3 = 0; i3 < length; ++i3) {
        codePoint = string.charCodeAt(i3);
        if (codePoint > 55295 && codePoint < 57344) {
          if (!leadSurrogate) {
            if (codePoint > 56319) {
              if ((units -= 3) > -1)
                bytes.push(239, 191, 189);
              continue;
            } else if (i3 + 1 === length) {
              if ((units -= 3) > -1)
                bytes.push(239, 191, 189);
              continue;
            }
            leadSurrogate = codePoint;
            continue;
          }
          if (codePoint < 56320) {
            if ((units -= 3) > -1)
              bytes.push(239, 191, 189);
            leadSurrogate = codePoint;
            continue;
          }
          codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
        } else if (leadSurrogate) {
          if ((units -= 3) > -1)
            bytes.push(239, 191, 189);
        }
        leadSurrogate = null;
        if (codePoint < 128) {
          if ((units -= 1) < 0)
            break;
          bytes.push(codePoint);
        } else if (codePoint < 2048) {
          if ((units -= 2) < 0)
            break;
          bytes.push(
            codePoint >> 6 | 192,
            codePoint & 63 | 128
          );
        } else if (codePoint < 65536) {
          if ((units -= 3) < 0)
            break;
          bytes.push(
            codePoint >> 12 | 224,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else if (codePoint < 1114112) {
          if ((units -= 4) < 0)
            break;
          bytes.push(
            codePoint >> 18 | 240,
            codePoint >> 12 & 63 | 128,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else {
          throw new Error("Invalid code point");
        }
      }
      return bytes;
    }
    function asciiToBytes(str) {
      const byteArray = [];
      for (let i3 = 0; i3 < str.length; ++i3) {
        byteArray.push(str.charCodeAt(i3) & 255);
      }
      return byteArray;
    }
    function utf16leToBytes(str, units) {
      let c, hi, lo;
      const byteArray = [];
      for (let i3 = 0; i3 < str.length; ++i3) {
        if ((units -= 2) < 0)
          break;
        c = str.charCodeAt(i3);
        hi = c >> 8;
        lo = c % 256;
        byteArray.push(lo);
        byteArray.push(hi);
      }
      return byteArray;
    }
    function base64ToBytes(str) {
      return base64.toByteArray(base64clean(str));
    }
    function blitBuffer(src, dst, offset, length) {
      let i3;
      for (i3 = 0; i3 < length; ++i3) {
        if (i3 + offset >= dst.length || i3 >= src.length)
          break;
        dst[i3 + offset] = src[i3];
      }
      return i3;
    }
    function isInstance(obj, type) {
      return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
    }
    function numberIsNaN(obj) {
      return obj !== obj;
    }
    var hexSliceLookupTable = function() {
      const alphabet = "0123456789abcdef";
      const table = new Array(256);
      for (let i3 = 0; i3 < 16; ++i3) {
        const i16 = i3 * 16;
        for (let j = 0; j < 16; ++j) {
          table[i16 + j] = alphabet[i3] + alphabet[j];
        }
      }
      return table;
    }();
    function defineBigIntMethod(fn) {
      return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
    }
    function BufferBigIntNotDefined() {
      throw new Error("BigInt not supported");
    }
  }
});

// src/ws.ts
var WebSocketClass;
if (typeof window !== "undefined" && window.WebSocket) {
  WebSocketClass = window.WebSocket;
} else {
  WebSocketClass = globalThis.WebSocket || (() => {
    throw new Error("WebSocket is not available. Please use in browser environment or install isomorphic-ws for Node.js.");
  });
}
var MPCSocket = class {
  constructor(url) {
    this.url = url;
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocketClass(this.url);
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onErr = (e3) => {
        cleanup();
        reject(e3);
      };
      const cleanup = () => {
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onErr);
      };
      this.ws.addEventListener("open", onOpen, { once: true });
      this.ws.addEventListener("error", onErr, { once: true });
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  waitOne(timeoutMs = 3e4) {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        cleanup();
        reject(new Error("ws timeout"));
      }, timeoutMs);
      const handler = (ev) => {
        cleanup();
        const text = typeof ev.data === "string" ? ev.data : ev.data?.toString?.() ?? "";
        resolve(JSON.parse(text));
      };
      const err = (e3) => {
        cleanup();
        reject(e3);
      };
      const cleanup = () => {
        clearTimeout(to);
        this.ws.removeEventListener("message", handler);
        this.ws.removeEventListener("error", err);
      };
      this.ws.addEventListener("message", handler, { once: true });
      this.ws.addEventListener("error", err, { once: true });
    });
  }
  close(code = 1e3, reason = "done") {
    try {
      this.ws.close(code, reason);
    } catch {
    }
  }
};

// node_modules/@noble/secp256k1/lib/esm/index.js
var nodeCrypto = __toESM(require_crypto(), 1);
var _0n = BigInt(0);
var _1n = BigInt(1);
var _2n = BigInt(2);
var _3n = BigInt(3);
var _8n = BigInt(8);
var CURVE = Object.freeze({
  a: _0n,
  b: BigInt(7),
  P: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: _1n,
  Gx: BigInt("55066263022277343669578718895168534326250603453777594175500187360389116729240"),
  Gy: BigInt("32670510020758816978083085130507043184471273380659243275938904335757337482424"),
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee")
});
var divNearest = (a, b2) => (a + b2 / _2n) / b2;
var endo = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  splitScalar(k) {
    const { n: n3 } = CURVE;
    const a1 = BigInt("0x3086d221a7d46bcde86c90e49284eb15");
    const b1 = -_1n * BigInt("0xe4437ed6010e88286f547fa90abfe4c3");
    const a2 = BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8");
    const b2 = a1;
    const POW_2_128 = BigInt("0x100000000000000000000000000000000");
    const c1 = divNearest(b2 * k, n3);
    const c2 = divNearest(-b1 * k, n3);
    let k1 = mod(k - c1 * a1 - c2 * a2, n3);
    let k2 = mod(-c1 * b1 - c2 * b2, n3);
    const k1neg = k1 > POW_2_128;
    const k2neg = k2 > POW_2_128;
    if (k1neg)
      k1 = n3 - k1;
    if (k2neg)
      k2 = n3 - k2;
    if (k1 > POW_2_128 || k2 > POW_2_128) {
      throw new Error("splitScalarEndo: Endomorphism failed, k=" + k);
    }
    return { k1neg, k1, k2neg, k2 };
  }
};
var fieldLen = 32;
var groupLen = 32;
var compressedLen = fieldLen + 1;
var uncompressedLen = 2 * fieldLen + 1;
function weierstrass(x) {
  const { a, b: b2 } = CURVE;
  const x2 = mod(x * x);
  const x3 = mod(x2 * x);
  return mod(x3 + a * x + b2);
}
var USE_ENDOMORPHISM = CURVE.a === _0n;
var ShaError = class extends Error {
  constructor(message) {
    super(message);
  }
};
function assertJacPoint(other) {
  if (!(other instanceof JacobianPoint))
    throw new TypeError("JacobianPoint expected");
}
var JacobianPoint = class _JacobianPoint {
  constructor(x, y2, z) {
    this.x = x;
    this.y = y2;
    this.z = z;
  }
  static fromAffine(p2) {
    if (!(p2 instanceof Point)) {
      throw new TypeError("JacobianPoint#fromAffine: expected Point");
    }
    if (p2.equals(Point.ZERO))
      return _JacobianPoint.ZERO;
    return new _JacobianPoint(p2.x, p2.y, _1n);
  }
  static toAffineBatch(points) {
    const toInv = invertBatch(points.map((p2) => p2.z));
    return points.map((p2, i3) => p2.toAffine(toInv[i3]));
  }
  static normalizeZ(points) {
    return _JacobianPoint.toAffineBatch(points).map(_JacobianPoint.fromAffine);
  }
  equals(other) {
    assertJacPoint(other);
    const { x: X1, y: Y1, z: Z1 } = this;
    const { x: X2, y: Y2, z: Z2 } = other;
    const Z1Z1 = mod(Z1 * Z1);
    const Z2Z2 = mod(Z2 * Z2);
    const U1 = mod(X1 * Z2Z2);
    const U2 = mod(X2 * Z1Z1);
    const S1 = mod(mod(Y1 * Z2) * Z2Z2);
    const S2 = mod(mod(Y2 * Z1) * Z1Z1);
    return U1 === U2 && S1 === S2;
  }
  negate() {
    return new _JacobianPoint(this.x, mod(-this.y), this.z);
  }
  double() {
    const { x: X1, y: Y1, z: Z1 } = this;
    const A = mod(X1 * X1);
    const B2 = mod(Y1 * Y1);
    const C = mod(B2 * B2);
    const x1b = X1 + B2;
    const D = mod(_2n * (mod(x1b * x1b) - A - C));
    const E = mod(_3n * A);
    const F = mod(E * E);
    const X3 = mod(F - _2n * D);
    const Y3 = mod(E * (D - X3) - _8n * C);
    const Z3 = mod(_2n * Y1 * Z1);
    return new _JacobianPoint(X3, Y3, Z3);
  }
  add(other) {
    assertJacPoint(other);
    const { x: X1, y: Y1, z: Z1 } = this;
    const { x: X2, y: Y2, z: Z2 } = other;
    if (X2 === _0n || Y2 === _0n)
      return this;
    if (X1 === _0n || Y1 === _0n)
      return other;
    const Z1Z1 = mod(Z1 * Z1);
    const Z2Z2 = mod(Z2 * Z2);
    const U1 = mod(X1 * Z2Z2);
    const U2 = mod(X2 * Z1Z1);
    const S1 = mod(mod(Y1 * Z2) * Z2Z2);
    const S2 = mod(mod(Y2 * Z1) * Z1Z1);
    const H = mod(U2 - U1);
    const r3 = mod(S2 - S1);
    if (H === _0n) {
      if (r3 === _0n) {
        return this.double();
      } else {
        return _JacobianPoint.ZERO;
      }
    }
    const HH = mod(H * H);
    const HHH = mod(H * HH);
    const V = mod(U1 * HH);
    const X3 = mod(r3 * r3 - HHH - _2n * V);
    const Y3 = mod(r3 * (V - X3) - S1 * HHH);
    const Z3 = mod(Z1 * Z2 * H);
    return new _JacobianPoint(X3, Y3, Z3);
  }
  subtract(other) {
    return this.add(other.negate());
  }
  multiplyUnsafe(scalar) {
    const P0 = _JacobianPoint.ZERO;
    if (typeof scalar === "bigint" && scalar === _0n)
      return P0;
    let n3 = normalizeScalar(scalar);
    if (n3 === _1n)
      return this;
    if (!USE_ENDOMORPHISM) {
      let p2 = P0;
      let d3 = this;
      while (n3 > _0n) {
        if (n3 & _1n)
          p2 = p2.add(d3);
        d3 = d3.double();
        n3 >>= _1n;
      }
      return p2;
    }
    let { k1neg, k1, k2neg, k2 } = endo.splitScalar(n3);
    let k1p = P0;
    let k2p = P0;
    let d2 = this;
    while (k1 > _0n || k2 > _0n) {
      if (k1 & _1n)
        k1p = k1p.add(d2);
      if (k2 & _1n)
        k2p = k2p.add(d2);
      d2 = d2.double();
      k1 >>= _1n;
      k2 >>= _1n;
    }
    if (k1neg)
      k1p = k1p.negate();
    if (k2neg)
      k2p = k2p.negate();
    k2p = new _JacobianPoint(mod(k2p.x * endo.beta), k2p.y, k2p.z);
    return k1p.add(k2p);
  }
  precomputeWindow(W) {
    const windows = USE_ENDOMORPHISM ? 128 / W + 1 : 256 / W + 1;
    const points = [];
    let p2 = this;
    let base = p2;
    for (let window2 = 0; window2 < windows; window2++) {
      base = p2;
      points.push(base);
      for (let i3 = 1; i3 < 2 ** (W - 1); i3++) {
        base = base.add(p2);
        points.push(base);
      }
      p2 = base.double();
    }
    return points;
  }
  wNAF(n3, affinePoint) {
    if (!affinePoint && this.equals(_JacobianPoint.BASE))
      affinePoint = Point.BASE;
    const W = affinePoint && affinePoint._WINDOW_SIZE || 1;
    if (256 % W) {
      throw new Error("Point#wNAF: Invalid precomputation window, must be power of 2");
    }
    let precomputes = affinePoint && pointPrecomputes.get(affinePoint);
    if (!precomputes) {
      precomputes = this.precomputeWindow(W);
      if (affinePoint && W !== 1) {
        precomputes = _JacobianPoint.normalizeZ(precomputes);
        pointPrecomputes.set(affinePoint, precomputes);
      }
    }
    let p2 = _JacobianPoint.ZERO;
    let f = _JacobianPoint.BASE;
    const windows = 1 + (USE_ENDOMORPHISM ? 128 / W : 256 / W);
    const windowSize = 2 ** (W - 1);
    const mask = BigInt(2 ** W - 1);
    const maxNumber = 2 ** W;
    const shiftBy = BigInt(W);
    for (let window2 = 0; window2 < windows; window2++) {
      const offset = window2 * windowSize;
      let wbits = Number(n3 & mask);
      n3 >>= shiftBy;
      if (wbits > windowSize) {
        wbits -= maxNumber;
        n3 += _1n;
      }
      const offset1 = offset;
      const offset2 = offset + Math.abs(wbits) - 1;
      const cond1 = window2 % 2 !== 0;
      const cond2 = wbits < 0;
      if (wbits === 0) {
        f = f.add(constTimeNegate(cond1, precomputes[offset1]));
      } else {
        p2 = p2.add(constTimeNegate(cond2, precomputes[offset2]));
      }
    }
    return { p: p2, f };
  }
  multiply(scalar, affinePoint) {
    let n3 = normalizeScalar(scalar);
    let point;
    let fake;
    if (USE_ENDOMORPHISM) {
      const { k1neg, k1, k2neg, k2 } = endo.splitScalar(n3);
      let { p: k1p, f: f1p } = this.wNAF(k1, affinePoint);
      let { p: k2p, f: f2p } = this.wNAF(k2, affinePoint);
      k1p = constTimeNegate(k1neg, k1p);
      k2p = constTimeNegate(k2neg, k2p);
      k2p = new _JacobianPoint(mod(k2p.x * endo.beta), k2p.y, k2p.z);
      point = k1p.add(k2p);
      fake = f1p.add(f2p);
    } else {
      const { p: p2, f } = this.wNAF(n3, affinePoint);
      point = p2;
      fake = f;
    }
    return _JacobianPoint.normalizeZ([point, fake])[0];
  }
  toAffine(invZ) {
    const { x, y: y2, z } = this;
    const is0 = this.equals(_JacobianPoint.ZERO);
    if (invZ == null)
      invZ = is0 ? _8n : invert(z);
    const iz1 = invZ;
    const iz2 = mod(iz1 * iz1);
    const iz3 = mod(iz2 * iz1);
    const ax = mod(x * iz2);
    const ay = mod(y2 * iz3);
    const zz = mod(z * iz1);
    if (is0)
      return Point.ZERO;
    if (zz !== _1n)
      throw new Error("invZ was invalid");
    return new Point(ax, ay);
  }
};
JacobianPoint.BASE = new JacobianPoint(CURVE.Gx, CURVE.Gy, _1n);
JacobianPoint.ZERO = new JacobianPoint(_0n, _1n, _0n);
function constTimeNegate(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
var pointPrecomputes = /* @__PURE__ */ new WeakMap();
var Point = class _Point {
  constructor(x, y2) {
    this.x = x;
    this.y = y2;
  }
  _setWindowSize(windowSize) {
    this._WINDOW_SIZE = windowSize;
    pointPrecomputes.delete(this);
  }
  hasEvenY() {
    return this.y % _2n === _0n;
  }
  static fromCompressedHex(bytes) {
    const isShort = bytes.length === 32;
    const x = bytesToNumber(isShort ? bytes : bytes.subarray(1));
    if (!isValidFieldElement(x))
      throw new Error("Point is not on curve");
    const y2 = weierstrass(x);
    let y3 = sqrtMod(y2);
    const isYOdd = (y3 & _1n) === _1n;
    if (isShort) {
      if (isYOdd)
        y3 = mod(-y3);
    } else {
      const isFirstByteOdd = (bytes[0] & 1) === 1;
      if (isFirstByteOdd !== isYOdd)
        y3 = mod(-y3);
    }
    const point = new _Point(x, y3);
    point.assertValidity();
    return point;
  }
  static fromUncompressedHex(bytes) {
    const x = bytesToNumber(bytes.subarray(1, fieldLen + 1));
    const y2 = bytesToNumber(bytes.subarray(fieldLen + 1, fieldLen * 2 + 1));
    const point = new _Point(x, y2);
    point.assertValidity();
    return point;
  }
  static fromHex(hex) {
    const bytes = ensureBytes(hex);
    const len = bytes.length;
    const header = bytes[0];
    if (len === fieldLen)
      return this.fromCompressedHex(bytes);
    if (len === compressedLen && (header === 2 || header === 3)) {
      return this.fromCompressedHex(bytes);
    }
    if (len === uncompressedLen && header === 4)
      return this.fromUncompressedHex(bytes);
    throw new Error(`Point.fromHex: received invalid point. Expected 32-${compressedLen} compressed bytes or ${uncompressedLen} uncompressed bytes, not ${len}`);
  }
  static fromPrivateKey(privateKey) {
    return _Point.BASE.multiply(normalizePrivateKey(privateKey));
  }
  static fromSignature(msgHash, signature, recovery) {
    const { r: r3, s: s2 } = normalizeSignature(signature);
    if (![0, 1, 2, 3].includes(recovery))
      throw new Error("Cannot recover: invalid recovery bit");
    const h2 = truncateHash(ensureBytes(msgHash));
    const { n: n3 } = CURVE;
    const radj = recovery === 2 || recovery === 3 ? r3 + n3 : r3;
    const rinv = invert(radj, n3);
    const u1 = mod(-h2 * rinv, n3);
    const u2 = mod(s2 * rinv, n3);
    const prefix = recovery & 1 ? "03" : "02";
    const R2 = _Point.fromHex(prefix + numTo32bStr(radj));
    const Q = _Point.BASE.multiplyAndAddUnsafe(R2, u1, u2);
    if (!Q)
      throw new Error("Cannot recover signature: point at infinify");
    Q.assertValidity();
    return Q;
  }
  toRawBytes(isCompressed = false) {
    return hexToBytes(this.toHex(isCompressed));
  }
  toHex(isCompressed = false) {
    const x = numTo32bStr(this.x);
    if (isCompressed) {
      const prefix = this.hasEvenY() ? "02" : "03";
      return `${prefix}${x}`;
    } else {
      return `04${x}${numTo32bStr(this.y)}`;
    }
  }
  toHexX() {
    return this.toHex(true).slice(2);
  }
  toRawX() {
    return this.toRawBytes(true).slice(1);
  }
  assertValidity() {
    const msg = "Point is not on elliptic curve";
    const { x, y: y2 } = this;
    if (!isValidFieldElement(x) || !isValidFieldElement(y2))
      throw new Error(msg);
    const left = mod(y2 * y2);
    const right = weierstrass(x);
    if (mod(left - right) !== _0n)
      throw new Error(msg);
  }
  equals(other) {
    return this.x === other.x && this.y === other.y;
  }
  negate() {
    return new _Point(this.x, mod(-this.y));
  }
  double() {
    return JacobianPoint.fromAffine(this).double().toAffine();
  }
  add(other) {
    return JacobianPoint.fromAffine(this).add(JacobianPoint.fromAffine(other)).toAffine();
  }
  subtract(other) {
    return this.add(other.negate());
  }
  multiply(scalar) {
    return JacobianPoint.fromAffine(this).multiply(scalar, this).toAffine();
  }
  multiplyAndAddUnsafe(Q, a, b2) {
    const P = JacobianPoint.fromAffine(this);
    const aP = a === _0n || a === _1n || this !== _Point.BASE ? P.multiplyUnsafe(a) : P.multiply(a);
    const bQ = JacobianPoint.fromAffine(Q).multiplyUnsafe(b2);
    const sum = aP.add(bQ);
    return sum.equals(JacobianPoint.ZERO) ? void 0 : sum.toAffine();
  }
};
Point.BASE = new Point(CURVE.Gx, CURVE.Gy);
Point.ZERO = new Point(_0n, _0n);
function sliceDER(s2) {
  return Number.parseInt(s2[0], 16) >= 8 ? "00" + s2 : s2;
}
function parseDERInt(data) {
  if (data.length < 2 || data[0] !== 2) {
    throw new Error(`Invalid signature integer tag: ${bytesToHex(data)}`);
  }
  const len = data[1];
  const res = data.subarray(2, len + 2);
  if (!len || res.length !== len) {
    throw new Error(`Invalid signature integer: wrong length`);
  }
  if (res[0] === 0 && res[1] <= 127) {
    throw new Error("Invalid signature integer: trailing length");
  }
  return { data: bytesToNumber(res), left: data.subarray(len + 2) };
}
function parseDERSignature(data) {
  if (data.length < 2 || data[0] != 48) {
    throw new Error(`Invalid signature tag: ${bytesToHex(data)}`);
  }
  if (data[1] !== data.length - 2) {
    throw new Error("Invalid signature: incorrect length");
  }
  const { data: r3, left: sBytes } = parseDERInt(data.subarray(2));
  const { data: s2, left: rBytesLeft } = parseDERInt(sBytes);
  if (rBytesLeft.length) {
    throw new Error(`Invalid signature: left bytes after parsing: ${bytesToHex(rBytesLeft)}`);
  }
  return { r: r3, s: s2 };
}
var Signature = class _Signature {
  constructor(r3, s2) {
    this.r = r3;
    this.s = s2;
    this.assertValidity();
  }
  static fromCompact(hex) {
    const arr = isBytes(hex);
    const name = "Signature.fromCompact";
    if (typeof hex !== "string" && !arr)
      throw new TypeError(`${name}: Expected string or Uint8Array`);
    const str = arr ? bytesToHex(hex) : hex;
    if (str.length !== 128)
      throw new Error(`${name}: Expected 64-byte hex`);
    return new _Signature(hexToNumber(str.slice(0, 64)), hexToNumber(str.slice(64, 128)));
  }
  static fromDER(hex) {
    const arr = isBytes(hex);
    if (typeof hex !== "string" && !arr)
      throw new TypeError(`Signature.fromDER: Expected string or Uint8Array`);
    const { r: r3, s: s2 } = parseDERSignature(arr ? hex : hexToBytes(hex));
    return new _Signature(r3, s2);
  }
  static fromHex(hex) {
    return this.fromDER(hex);
  }
  assertValidity() {
    const { r: r3, s: s2 } = this;
    if (!isWithinCurveOrder(r3))
      throw new Error("Invalid Signature: r must be 0 < r < n");
    if (!isWithinCurveOrder(s2))
      throw new Error("Invalid Signature: s must be 0 < s < n");
  }
  hasHighS() {
    const HALF = CURVE.n >> _1n;
    return this.s > HALF;
  }
  normalizeS() {
    return this.hasHighS() ? new _Signature(this.r, mod(-this.s, CURVE.n)) : this;
  }
  toDERRawBytes() {
    return hexToBytes(this.toDERHex());
  }
  toDERHex() {
    const sHex = sliceDER(numberToHexUnpadded(this.s));
    const rHex = sliceDER(numberToHexUnpadded(this.r));
    const sHexL = sHex.length / 2;
    const rHexL = rHex.length / 2;
    const sLen = numberToHexUnpadded(sHexL);
    const rLen = numberToHexUnpadded(rHexL);
    const length = numberToHexUnpadded(rHexL + sHexL + 4);
    return `30${length}02${rLen}${rHex}02${sLen}${sHex}`;
  }
  toRawBytes() {
    return this.toDERRawBytes();
  }
  toHex() {
    return this.toDERHex();
  }
  toCompactRawBytes() {
    return hexToBytes(this.toCompactHex());
  }
  toCompactHex() {
    return numTo32bStr(this.r) + numTo32bStr(this.s);
  }
};
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(item) {
  if (!isBytes(item))
    throw new Error("Uint8Array expected");
}
function concatBytes(...arrays) {
  arrays.every(abytes);
  if (arrays.length === 1)
    return arrays[0];
  const length = arrays.reduce((a, arr) => a + arr.length, 0);
  const result = new Uint8Array(length);
  for (let i3 = 0, pad = 0; i3 < arrays.length; i3++) {
    const arr = arrays[i3];
    result.set(arr, pad);
    pad += arr.length;
  }
  return result;
}
var hexes = Array.from({ length: 256 }, (_, i3) => i3.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  let hex = "";
  for (let i3 = 0; i3 < bytes.length; i3++) {
    hex += hexes[bytes[i3]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n22 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n22 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n22;
  }
  return array;
}
var POW_2_256 = BigInt("0x10000000000000000000000000000000000000000000000000000000000000000");
function numTo32bStr(num) {
  if (typeof num !== "bigint")
    throw new Error("Expected bigint");
  if (!(_0n <= num && num < POW_2_256))
    throw new Error("Expected number 0 <= n < 2^256");
  return num.toString(16).padStart(64, "0");
}
function numTo32b(num) {
  const b2 = hexToBytes(numTo32bStr(num));
  if (b2.length !== 32)
    throw new Error("Error: expected 32 bytes");
  return b2;
}
function numberToHexUnpadded(num) {
  const hex = num.toString(16);
  return hex.length & 1 ? `0${hex}` : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string") {
    throw new TypeError("hexToNumber: expected string, got " + typeof hex);
  }
  return BigInt(`0x${hex}`);
}
function bytesToNumber(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function ensureBytes(hex) {
  return isBytes(hex) ? Uint8Array.from(hex) : hexToBytes(hex);
}
function normalizeScalar(num) {
  if (typeof num === "number" && Number.isSafeInteger(num) && num > 0)
    return BigInt(num);
  if (typeof num === "bigint" && isWithinCurveOrder(num))
    return num;
  throw new TypeError("Expected valid private scalar: 0 < scalar < curve.n");
}
function mod(a, b2 = CURVE.P) {
  const result = a % b2;
  return result >= _0n ? result : b2 + result;
}
function pow2(x, power) {
  const { P } = CURVE;
  let res = x;
  while (power-- > _0n) {
    res *= res;
    res %= P;
  }
  return res;
}
function sqrtMod(x) {
  const { P } = CURVE;
  const _6n = BigInt(6);
  const _11n = BigInt(11);
  const _22n = BigInt(22);
  const _23n = BigInt(23);
  const _44n = BigInt(44);
  const _88n = BigInt(88);
  const b2 = x * x * x % P;
  const b3 = b2 * b2 * x % P;
  const b6 = pow2(b3, _3n) * b3 % P;
  const b9 = pow2(b6, _3n) * b3 % P;
  const b11 = pow2(b9, _2n) * b2 % P;
  const b22 = pow2(b11, _11n) * b11 % P;
  const b44 = pow2(b22, _22n) * b22 % P;
  const b88 = pow2(b44, _44n) * b44 % P;
  const b176 = pow2(b88, _88n) * b88 % P;
  const b220 = pow2(b176, _44n) * b44 % P;
  const b223 = pow2(b220, _3n) * b3 % P;
  const t1 = pow2(b223, _23n) * b22 % P;
  const t2 = pow2(t1, _6n) * b2 % P;
  const rt = pow2(t2, _2n);
  const xc = rt * rt % P;
  if (xc !== x)
    throw new Error("Cannot find square root");
  return rt;
}
function invert(number, modulo = CURVE.P) {
  if (number === _0n || modulo <= _0n) {
    throw new Error(`invert: expected positive integers, got n=${number} mod=${modulo}`);
  }
  let a = mod(number, modulo);
  let b2 = modulo;
  let x = _0n, y2 = _1n, u2 = _1n, v = _0n;
  while (a !== _0n) {
    const q3 = b2 / a;
    const r3 = b2 % a;
    const m2 = x - u2 * q3;
    const n3 = y2 - v * q3;
    b2 = a, a = r3, x = u2, y2 = v, u2 = m2, v = n3;
  }
  const gcd = b2;
  if (gcd !== _1n)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function invertBatch(nums, p2 = CURVE.P) {
  const scratch = new Array(nums.length);
  const lastMultiplied = nums.reduce((acc, num, i3) => {
    if (num === _0n)
      return acc;
    scratch[i3] = acc;
    return mod(acc * num, p2);
  }, _1n);
  const inverted = invert(lastMultiplied, p2);
  nums.reduceRight((acc, num, i3) => {
    if (num === _0n)
      return acc;
    scratch[i3] = mod(acc * scratch[i3], p2);
    return mod(acc * num, p2);
  }, inverted);
  return scratch;
}
function bits2int_2(bytes) {
  const delta = bytes.length * 8 - groupLen * 8;
  const num = bytesToNumber(bytes);
  return delta > 0 ? num >> BigInt(delta) : num;
}
function truncateHash(hash, truncateOnly = false) {
  const h2 = bits2int_2(hash);
  if (truncateOnly)
    return h2;
  const { n: n3 } = CURVE;
  return h2 >= n3 ? h2 - n3 : h2;
}
var _sha256Sync;
var _hmacSha256Sync;
function isWithinCurveOrder(num) {
  return _0n < num && num < CURVE.n;
}
function isValidFieldElement(num) {
  return _0n < num && num < CURVE.P;
}
function normalizePrivateKey(key) {
  let num;
  if (typeof key === "bigint") {
    num = key;
  } else if (typeof key === "number" && Number.isSafeInteger(key) && key > 0) {
    num = BigInt(key);
  } else if (typeof key === "string") {
    if (key.length !== 2 * groupLen)
      throw new Error("Expected 32 bytes of private key");
    num = hexToNumber(key);
  } else if (isBytes(key)) {
    if (key.length !== groupLen)
      throw new Error("Expected 32 bytes of private key");
    num = bytesToNumber(key);
  } else {
    throw new TypeError("Expected valid private key");
  }
  if (!isWithinCurveOrder(num))
    throw new Error("Expected private key: 0 < key < n");
  return num;
}
function normalizePublicKey(publicKey) {
  if (publicKey instanceof Point) {
    publicKey.assertValidity();
    return publicKey;
  } else {
    return Point.fromHex(publicKey);
  }
}
function normalizeSignature(signature) {
  if (signature instanceof Signature) {
    signature.assertValidity();
    return signature;
  }
  try {
    return Signature.fromDER(signature);
  } catch (error) {
    return Signature.fromCompact(signature);
  }
}
var vopts = { strict: true };
function verify(signature, msgHash, publicKey, opts = vopts) {
  let sig;
  try {
    sig = normalizeSignature(signature);
    msgHash = ensureBytes(msgHash);
  } catch (error) {
    return false;
  }
  const { r: r3, s: s2 } = sig;
  if (opts.strict && sig.hasHighS())
    return false;
  const h2 = truncateHash(msgHash);
  let P;
  try {
    P = normalizePublicKey(publicKey);
  } catch (error) {
    return false;
  }
  const { n: n3 } = CURVE;
  const sinv = invert(s2, n3);
  const u1 = mod(h2 * sinv, n3);
  const u2 = mod(r3 * sinv, n3);
  const R2 = Point.BASE.multiplyAndAddUnsafe(P, u1, u2);
  if (!R2)
    return false;
  const v = mod(R2.x, n3);
  return v === r3;
}
Point.BASE._setWindowSize(8);
var crypto2 = {
  node: nodeCrypto,
  web: typeof self === "object" && "crypto" in self ? self.crypto : void 0
};
var TAGGED_HASH_PREFIXES = {};
var utils = {
  bytesToHex,
  hexToBytes,
  concatBytes,
  mod,
  invert,
  isValidPrivateKey(privateKey) {
    try {
      normalizePrivateKey(privateKey);
      return true;
    } catch (error) {
      return false;
    }
  },
  _bigintTo32Bytes: numTo32b,
  _normalizePrivateKey: normalizePrivateKey,
  hashToPrivateKey: (hash) => {
    hash = ensureBytes(hash);
    const minLen = groupLen + 8;
    if (hash.length < minLen || hash.length > 1024) {
      throw new Error(`Expected valid bytes of private key as per FIPS 186`);
    }
    const num = mod(bytesToNumber(hash), CURVE.n - _1n) + _1n;
    return numTo32b(num);
  },
  randomBytes: (bytesLength = 32) => {
    if (crypto2.web) {
      return crypto2.web.getRandomValues(new Uint8Array(bytesLength));
    } else if (crypto2.node) {
      const { randomBytes } = crypto2.node;
      return Uint8Array.from(randomBytes(bytesLength));
    } else {
      throw new Error("The environment doesn't have randomBytes function");
    }
  },
  randomPrivateKey: () => utils.hashToPrivateKey(utils.randomBytes(groupLen + 8)),
  precompute(windowSize = 8, point = Point.BASE) {
    const cached = point === Point.BASE ? point : new Point(point.x, point.y);
    cached._setWindowSize(windowSize);
    cached.multiply(_3n);
    return cached;
  },
  sha256: async (...messages) => {
    if (crypto2.web) {
      const buffer = await crypto2.web.subtle.digest("SHA-256", concatBytes(...messages));
      return new Uint8Array(buffer);
    } else if (crypto2.node) {
      const { createHash } = crypto2.node;
      const hash = createHash("sha256");
      messages.forEach((m2) => hash.update(m2));
      return Uint8Array.from(hash.digest());
    } else {
      throw new Error("The environment doesn't have sha256 function");
    }
  },
  hmacSha256: async (key, ...messages) => {
    if (crypto2.web) {
      const ckey = await crypto2.web.subtle.importKey("raw", key, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]);
      const message = concatBytes(...messages);
      const buffer = await crypto2.web.subtle.sign("HMAC", ckey, message);
      return new Uint8Array(buffer);
    } else if (crypto2.node) {
      const { createHmac } = crypto2.node;
      const hash = createHmac("sha256", key);
      messages.forEach((m2) => hash.update(m2));
      return Uint8Array.from(hash.digest());
    } else {
      throw new Error("The environment doesn't have hmac-sha256 function");
    }
  },
  sha256Sync: void 0,
  hmacSha256Sync: void 0,
  taggedHash: async (tag, ...messages) => {
    let tagP = TAGGED_HASH_PREFIXES[tag];
    if (tagP === void 0) {
      const tagH = await utils.sha256(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
      tagP = concatBytes(tagH, tagH);
      TAGGED_HASH_PREFIXES[tag] = tagP;
    }
    return utils.sha256(tagP, ...messages);
  },
  taggedHashSync: (tag, ...messages) => {
    if (typeof _sha256Sync !== "function")
      throw new ShaError("sha256Sync is undefined, you need to set it");
    let tagP = TAGGED_HASH_PREFIXES[tag];
    if (tagP === void 0) {
      const tagH = _sha256Sync(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
      tagP = concatBytes(tagH, tagH);
      TAGGED_HASH_PREFIXES[tag] = tagP;
    }
    return _sha256Sync(tagP, ...messages);
  },
  _JacobianPoint: JacobianPoint
};
Object.defineProperties(utils, {
  sha256Sync: {
    configurable: false,
    get() {
      return _sha256Sync;
    },
    set(val) {
      if (!_sha256Sync)
        _sha256Sync = val;
    }
  },
  hmacSha256Sync: {
    configurable: false,
    get() {
      return _hmacSha256Sync;
    },
    set(val) {
      if (!_hmacSha256Sync)
        _hmacSha256Sync = val;
    }
  }
});

// node_modules/bigint-crypto-utils/dist/index.browser.esm.js
function n(n3) {
  return n3 >= 0 ? n3 : -n3;
}
function t(n3) {
  if ("number" == typeof n3 && (n3 = BigInt(n3)), 1n === n3)
    return 1;
  let t2 = 1;
  do {
    t2++;
  } while ((n3 >>= 1n) > 1n);
  return t2;
}
function e(n3, t2) {
  if ("number" == typeof n3 && (n3 = BigInt(n3)), "number" == typeof t2 && (t2 = BigInt(t2)), n3 <= 0n || t2 <= 0n)
    throw new RangeError("a and b MUST be > 0");
  let e3 = 0n, r3 = 1n, o3 = 1n, i3 = 0n;
  for (; 0n !== n3; ) {
    const s2 = t2 / n3, u2 = t2 % n3, a = e3 - o3 * s2, c = r3 - i3 * s2;
    t2 = n3, n3 = u2, e3 = o3, r3 = i3, o3 = a, i3 = c;
  }
  return { g: t2, x: e3, y: r3 };
}
function r(n3, t2) {
  if ("number" == typeof n3 && (n3 = BigInt(n3)), "number" == typeof t2 && (t2 = BigInt(t2)), t2 <= 0n)
    throw new RangeError("n must be > 0");
  const e3 = n3 % t2;
  return e3 < 0n ? e3 + t2 : e3;
}
function o(n3, t2) {
  const o3 = e(r(n3, t2), t2);
  if (1n !== o3.g)
    throw new RangeError(`${n3.toString()} does not have inverse modulo ${t2.toString()}`);
  return r(o3.x, t2);
}
function i(n3, t2, e3) {
  if (n3.length !== t2.length)
    throw new RangeError("The remainders and modulos arrays should have the same length");
  const i3 = e3 ?? t2.reduce((n4, t3) => n4 * t3, 1n);
  return t2.reduce((t3, e4, s2) => {
    const u2 = i3 / e4;
    return r(t3 + u2 * o(u2, e4) % i3 * n3[s2] % i3, i3);
  }, 0n);
}
function s(t2, e3) {
  let r3 = "number" == typeof t2 ? BigInt(n(t2)) : n(t2), o3 = "number" == typeof e3 ? BigInt(n(e3)) : n(e3);
  if (0n === r3)
    return o3;
  if (0n === o3)
    return r3;
  let i3 = 0n;
  for (; 0n === (1n & (r3 | o3)); )
    r3 >>= 1n, o3 >>= 1n, i3++;
  for (; 0n === (1n & r3); )
    r3 >>= 1n;
  do {
    for (; 0n === (1n & o3); )
      o3 >>= 1n;
    if (r3 > o3) {
      const n3 = r3;
      r3 = o3, o3 = n3;
    }
    o3 -= r3;
  } while (0n !== o3);
  return r3 << i3;
}
function u(t2, e3) {
  return "number" == typeof t2 && (t2 = BigInt(t2)), "number" == typeof e3 && (e3 = BigInt(e3)), 0n === t2 && 0n === e3 ? BigInt(0) : n(t2 / s(t2, e3) * e3);
}
function m(n3) {
  return n3.map((n4) => n4[0] ** (n4[1] - 1n) * (n4[0] - 1n)).reduce((n4, t2) => t2 * n4, 1n);
}
function d(t2, e3, s2, u2) {
  if ("number" == typeof t2 && (t2 = BigInt(t2)), "number" == typeof e3 && (e3 = BigInt(e3)), "number" == typeof s2 && (s2 = BigInt(s2)), s2 <= 0n)
    throw new RangeError("n must be > 0");
  if (1n === s2)
    return 0n;
  if (t2 = r(t2, s2), e3 < 0n)
    return o(d(t2, n(e3), s2, u2), s2);
  if (void 0 !== u2)
    return function(n3, t3, e4, r3) {
      const o3 = r3.map((n4) => n4[0] ** n4[1]), s3 = r3.map((n4) => m([n4])), u3 = s3.map((e5, r4) => d(n3, t3 % e5, o3[r4]));
      return i(u3, o3, e4);
    }(t2, e3, s2, function(n3) {
      const t3 = {};
      return n3.forEach((n4) => {
        if ("bigint" == typeof n4 || "number" == typeof n4) {
          const e4 = String(n4);
          void 0 === t3[e4] ? t3[e4] = { p: BigInt(n4), k: 1n } : t3[e4].k += 1n;
        } else {
          const e4 = String(n4[0]);
          void 0 === t3[e4] ? t3[e4] = { p: BigInt(n4[0]), k: BigInt(n4[1]) } : t3[e4].k += BigInt(n4[1]);
        }
      }), Object.values(t3).map((n4) => [n4.p, n4.k]);
    }(u2));
  let a = 1n;
  for (; e3 > 0; )
    e3 % 2n === 1n && (a = a * t2 % s2), e3 /= 2n, t2 = t2 ** 2n % s2;
  return a;
}
function l(n3) {
  let t2 = 0n;
  for (const e3 of n3.values()) {
    t2 = (t2 << 8n) + BigInt(e3);
  }
  return t2;
}
function b(n3, t2 = false) {
  if (n3 < 1)
    throw new RangeError("byteLength MUST be > 0");
  return new Promise(function(e3, r3) {
    {
      const r4 = new Uint8Array(n3);
      if (n3 <= 65536)
        self.crypto.getRandomValues(r4);
      else
        for (let t3 = 0; t3 < Math.ceil(n3 / 65536); t3++) {
          const e4 = 65536 * t3, o3 = e4 + 65535 < n3 ? e4 + 65535 : n3 - 1;
          self.crypto.getRandomValues(r4.subarray(e4, o3));
        }
      t2 && (r4[0] = 128 | r4[0]), e3(r4);
    }
  });
}
function h(n3, t2 = false) {
  if (n3 < 1)
    throw new RangeError("byteLength MUST be > 0");
  {
    const e3 = new Uint8Array(n3);
    if (n3 <= 65536)
      self.crypto.getRandomValues(e3);
    else
      for (let t3 = 0; t3 < Math.ceil(n3 / 65536); t3++) {
        const r3 = 65536 * t3, o3 = r3 + 65535 < n3 ? r3 + 65535 : n3 - 1;
        self.crypto.getRandomValues(e3.subarray(r3, o3));
      }
    return t2 && (e3[0] = 128 | e3[0]), e3;
  }
}
function w(n3, t2 = false) {
  if (n3 < 1)
    throw new RangeError("bitLength MUST be > 0");
  const e3 = Math.ceil(n3 / 8), r3 = n3 % 8;
  return new Promise((n4, o3) => {
    b(e3, false).then(function(e4) {
      if (0 !== r3 && (e4[0] = e4[0] & 2 ** r3 - 1), t2) {
        const n5 = 0 !== r3 ? 2 ** (r3 - 1) : 128;
        e4[0] = e4[0] | n5;
      }
      n4(e4);
    });
  });
}
function p(n3, t2 = false) {
  if (n3 < 1)
    throw new RangeError("bitLength MUST be > 0");
  const e3 = h(Math.ceil(n3 / 8), false), r3 = n3 % 8;
  if (0 !== r3 && (e3[0] = e3[0] & 2 ** r3 - 1), t2) {
    const n4 = 0 !== r3 ? 2 ** (r3 - 1) : 128;
    e3[0] = e3[0] | n4;
  }
  return e3;
}
function y(n3, e3 = 1n) {
  if (n3 <= e3)
    throw new RangeError("Arguments MUST be: max > min");
  const r3 = n3 - e3, o3 = t(r3);
  let i3;
  do {
    i3 = l(p(o3));
  } while (i3 > r3);
  return i3 + e3;
}
var B = false;
function I(n3, t2 = 16, e3 = false) {
  if ("number" == typeof n3 && (n3 = BigInt(n3)), n3 < 0n)
    throw RangeError("w MUST be >= 0");
  return new Promise((e4, r3) => {
    const o3 = new Worker($());
    o3.onmessage = (n4) => {
      void 0 !== n4?.data?._bcu?.isPrime && (o3.terminate(), e4(n4.data._bcu.isPrime));
    }, o3.onmessageerror = (n4) => {
      r3(n4);
    };
    const i3 = { _bcu: { rnd: n3, iterations: t2, id: 0 } };
    o3.postMessage(i3);
  });
}
function S(n3, t2) {
  if (2n === n3)
    return true;
  if (0n === (1n & n3) || 1n === n3)
    return false;
  const e3 = [3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n, 257n, 263n, 269n, 271n, 277n, 281n, 283n, 293n, 307n, 311n, 313n, 317n, 331n, 337n, 347n, 349n, 353n, 359n, 367n, 373n, 379n, 383n, 389n, 397n, 401n, 409n, 419n, 421n, 431n, 433n, 439n, 443n, 449n, 457n, 461n, 463n, 467n, 479n, 487n, 491n, 499n, 503n, 509n, 521n, 523n, 541n, 547n, 557n, 563n, 569n, 571n, 577n, 587n, 593n, 599n, 601n, 607n, 613n, 617n, 619n, 631n, 641n, 643n, 647n, 653n, 659n, 661n, 673n, 677n, 683n, 691n, 701n, 709n, 719n, 727n, 733n, 739n, 743n, 751n, 757n, 761n, 769n, 773n, 787n, 797n, 809n, 811n, 821n, 823n, 827n, 829n, 839n, 853n, 857n, 859n, 863n, 877n, 881n, 883n, 887n, 907n, 911n, 919n, 929n, 937n, 941n, 947n, 953n, 967n, 971n, 977n, 983n, 991n, 997n, 1009n, 1013n, 1019n, 1021n, 1031n, 1033n, 1039n, 1049n, 1051n, 1061n, 1063n, 1069n, 1087n, 1091n, 1093n, 1097n, 1103n, 1109n, 1117n, 1123n, 1129n, 1151n, 1153n, 1163n, 1171n, 1181n, 1187n, 1193n, 1201n, 1213n, 1217n, 1223n, 1229n, 1231n, 1237n, 1249n, 1259n, 1277n, 1279n, 1283n, 1289n, 1291n, 1297n, 1301n, 1303n, 1307n, 1319n, 1321n, 1327n, 1361n, 1367n, 1373n, 1381n, 1399n, 1409n, 1423n, 1427n, 1429n, 1433n, 1439n, 1447n, 1451n, 1453n, 1459n, 1471n, 1481n, 1483n, 1487n, 1489n, 1493n, 1499n, 1511n, 1523n, 1531n, 1543n, 1549n, 1553n, 1559n, 1567n, 1571n, 1579n, 1583n, 1597n];
  for (let t3 = 0; t3 < e3.length && e3[t3] <= n3; t3++) {
    const r4 = e3[t3];
    if (n3 === r4)
      return true;
    if (n3 % r4 === 0n)
      return false;
  }
  let r3 = 0n;
  const o3 = n3 - 1n;
  let i3 = o3;
  for (; i3 % 2n === 0n; )
    i3 /= 2n, ++r3;
  const s2 = o3 / 2n ** r3;
  do {
    let t3 = d(y(o3, 2n), s2, n3);
    if (1n === t3 || t3 === o3)
      continue;
    let e4 = 1;
    for (; e4 < r3 && (t3 = d(t3, 2n, n3), t3 !== o3); ) {
      if (1n === t3)
        return false;
      e4++;
    }
    if (t3 !== o3)
      return false;
  } while (0 != --t2);
  return true;
}
function $() {
  let n3 = `
  'use strict';
  const ${e.name} = ${e.toString()};
  const ${o.name} = ${o.toString()};
  const ${d.name} = ${d.toString()};
  const ${r.name} = ${r.toString()};
  const ${p.name} = ${p.toString()};
  const ${h.name} = ${h.toString()};
  const ${y.name} = ${y.toString()};
  const ${I.name} = ${S.toString()};
  ${t.toString()};
  ${l.toString()};`;
  return n3 += `
  onmessage = async function(msg) {
    if (msg !== undefined && msg.data !== undefined && msg.data._bcu !== undefined && msg.data._bcu.id !== undefined && msg.data._bcu.iterations !== undefined && msg.data._bcu.rnd !== undefined) {
      const msgToParent = {
        _bcu: {
          isPrime: await ${I.name}(msg.data._bcu.rnd, msg.data._bcu.iterations),
          value: msg.data._bcu.rnd,
          id: msg.data._bcu.id
        }
      };
      postMessage(msgToParent);
    }
  }`, function(n4) {
    n4 = `(() => {${n4}})()`;
    const t2 = new Blob([n4], { type: "text/javascript" });
    return window.URL.createObjectURL(t2);
  }(n3);
}
function R(n3, t2 = 16) {
  if (n3 < 1)
    throw new RangeError("bitLength MUST be > 0");
  if (!B) {
    let e3 = 0n;
    do {
      e3 = l(p(n3, true));
    } while (!S(e3, t2));
    return new Promise((n4) => {
      n4(e3);
    });
  }
  return new Promise((e3, r3) => {
    const o3 = [], i3 = (r4, i4) => {
      if (r4._bcu.isPrime) {
        for (let n4 = 0; n4 < o3.length; n4++)
          o3[n4].terminate();
        for (; o3.length > 0; )
          o3.pop();
        e3(r4._bcu.value);
      } else {
        const e4 = l(p(n3, true));
        try {
          const n4 = { _bcu: { rnd: e4, iterations: t2, id: r4._bcu.id } };
          i4.postMessage(n4);
        } catch (n4) {
        }
      }
    };
    {
      const n4 = $();
      for (let t3 = 0; t3 < self.navigator.hardwareConcurrency - 1; t3++) {
        const t4 = new Worker(n4);
        t4.onmessage = (n5) => i3(n5.data, t4), o3.push(t4);
      }
    }
    for (let e4 = 0; e4 < o3.length; e4++)
      w(n3, true).then(function(n4) {
        const r4 = l(n4);
        o3[e4].postMessage({ _bcu: { rnd: r4, iterations: t2, id: e4 } });
      }).catch(r3);
  });
}
void 0 !== self.Worker && (B = true);

// node_modules/paillier-bigint/dist/index.browser.esm.js
var n2 = class {
  constructor(t2, n3) {
    this.n = t2, this._n2 = this.n ** 2n, this.g = n3;
  }
  get bitLength() {
    return t(this.n);
  }
  encrypt(n3, i3) {
    if (void 0 === i3)
      do {
        i3 = y(this.n);
      } while (1n !== s(i3, this.n));
    return d(this.g, n3, this._n2) * d(i3, this.n, this._n2) % this._n2;
  }
  addition(...t2) {
    return t2.reduce((t3, n3) => t3 * n3 % this._n2, 1n);
  }
  plaintextAddition(n3, ...i3) {
    return i3.reduce((n4, i4) => n4 * d(this.g, i4, this._n2) % this._n2, n3);
  }
  multiply(n3, i3) {
    return d(n3, i3, this._n2);
  }
};
var i2 = class {
  constructor(t2, n3, i3, e3, o3) {
    this.lambda = t2, this.mu = n3, this._p = e3, this._q = o3, this.publicKey = i3;
  }
  get bitLength() {
    return t(this.publicKey.n);
  }
  get n() {
    return this.publicKey.n;
  }
  decrypt(n3) {
    return void 0 !== this._p && void 0 !== this._q ? e2(d(n3, this.lambda, this.publicKey._n2, [[this._p, 2], [this._q, 2]]), this.publicKey.n) * this.mu % this.publicKey.n : e2(d(n3, this.lambda, this.publicKey._n2), this.publicKey.n) * this.mu % this.publicKey.n;
  }
  getRandomFactor(n3) {
    if (this.publicKey.g !== this.n + 1n)
      throw RangeError("Cannot recover the random factor if publicKey.g != publicKey.n + 1. You should generate yout keys using the simple variant, e.g. generateRandomKeys(3072, true)");
    if (void 0 === this._p || void 0 === this._q)
      throw Error("Cannot get random factor without knowing p and q");
    const i3 = this.decrypt(n3), e3 = (this._p - 1n) * (this._q - 1n), o3 = o(this.n, e3), s2 = n3 * (1n - i3 * this.n) % this.publicKey._n2;
    return d(s2, o3, this.n, [[this._p, 1], [this._q, 1]]);
  }
};
function e2(t2, n3) {
  return (t2 - 1n) / n3;
}
async function o2(o3 = 3072, s2 = false) {
  let h2, c, u2, d2, a, l2;
  do {
    h2 = await R(Math.floor(o3 / 2) + 1), c = await R(Math.floor(o3 / 2)), u2 = h2 * c;
  } while (c === h2 || t(u2) !== o3);
  if (s2)
    d2 = u2 + 1n, a = (h2 - 1n) * (c - 1n), l2 = o(a, u2);
  else {
    const n3 = u2 ** 2n;
    d2 = r2(u2, n3), a = u(h2 - 1n, c - 1n), l2 = o(e2(d(d2, a, n3), u2), u2);
  }
  const p2 = new n2(u2, d2);
  return { publicKey: p2, privateKey: new i2(a, l2, p2, h2, c) };
}
function r2(n3, i3) {
  const e3 = y(n3), o3 = y(n3);
  return (e3 * n3 + 1n) * d(o3, n3, i3) % i3;
}

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/utils.js
var import_buffer = __toESM(require_buffer());
async function sha256(arr) {
  return await utils.sha256(arr);
}
function stringToUint8Array(s2) {
  return Uint8Array.from(import_buffer.Buffer.from(s2, "utf8"));
}
function hexToUint8Array(hexString) {
  return Uint8Array.from(import_buffer.Buffer.from(hexString, "hex"));
}
function Uint8ArrayToHex(bytes) {
  return import_buffer.Buffer.from(bytes).toString("hex");
}
function Uint8ArrayTob64(bytes) {
  return import_buffer.Buffer.from(bytes).toString("base64");
}
function b64ToUint8Array(str) {
  return Uint8Array.from(import_buffer.Buffer.from(str, "base64"));
}
function bigintToUint8Array(num, order) {
  if (order) {
    const width = order * 2;
    const hex = bigintToHex(num).padStart(width, "0");
    return hexToUint8Array(hex);
  } else {
    let hex = bigintToHex(num);
    if (hex.length % 2) {
      hex = `0${hex}`;
    }
    return hexToUint8Array(hex);
  }
}
function Uint8ArraytoBigint(arr) {
  return hexToBigint(Uint8ArrayToHex(arr));
}
function b64ToBigint(str) {
  return Uint8ArraytoBigint(b64ToUint8Array(str));
}
function bigintTob64(num) {
  return Uint8ArrayTob64(bigintToUint8Array(num));
}
function bigintToHex(num) {
  return num.toString(16);
}
function hexToBigint(hex) {
  return BigInt(`0x${hex}`);
}
function pointToBytes(point) {
  return point.toRawBytes().slice(1);
}
function b64ToPoint(str) {
  const b2 = Uint8Array.from(import_buffer.Buffer.from(str, "base64"));
  const bytes = new Uint8Array(b2.length + 1);
  for (let i3 = 0; i3 < b2.length; i3++) {
    bytes[i3 + 1] = b2[i3];
  }
  bytes[0] = 4;
  return Point.fromHex(bytes);
}
function pointTob64(point) {
  return Uint8ArrayTob64(pointToBytes(point));
}
function hexToPoint(hex) {
  return Point.fromHex(`04${hex}`);
}
function pointToHex(point) {
  return point.toHex().slice(2);
}
function paillierPublickeyFromStr(str) {
  const n3 = b64ToBigint(str);
  return new n2(n3, n3 + BigInt(1));
}
function paillierPublickeyToStr(publicKey) {
  return bigintTob64(publicKey.n);
}
function paillierPrivateKeyFromObj(key) {
  const p2 = b64ToBigint(key.p);
  const q3 = b64ToBigint(key.q);
  const n3 = p2 * q3;
  const lambda = (p2 - BigInt(1)) * (q3 - BigInt(1));
  const mu = bigintModInv(lambda, n3);
  const paillierPublicKey = new n2(n3, n3 + BigInt(1));
  return new i2(lambda, mu, paillierPublicKey, p2, q3);
}
function paillierPrivateKeyToObj(privateKey) {
  const p2 = privateKey._p;
  const q3 = privateKey._q;
  return {
    p: bigintTob64(p2),
    q: bigintTob64(q3)
  };
}
function paillierEncryptedNumberFromStr(str) {
  return b64ToBigint(str);
}
function paillierEncryptedNumberToStr(num) {
  return bigintTob64(num);
}
function signatureToHex(r3, s2, order = 32) {
  return Uint8ArrayToHex(bigintToUint8Array(r3, order)) + Uint8ArrayToHex(bigintToUint8Array(s2, order));
}
async function verifySignature(messageHash, publicKey, signature) {
  return verify(signature, messageHash, publicKey);
}
function bigintModPow(b2, e3, n3) {
  return d(b2, e3, n3);
}
function bigintModInv(a, n3) {
  return d(a, -1, n3);
}
function bigintGcd(a, b2) {
  return s(a, b2);
}
function modPositive(a, b2) {
  return (a % b2 + b2) % b2;
}
function concatUint8Arrays(arr) {
  let length = 0;
  arr.forEach((item) => {
    length += item.length;
  });
  const mergedArray = new Uint8Array(length);
  let offset = 0;
  arr.forEach((item) => {
    mergedArray.set(item, offset);
    offset += item.length;
  });
  return mergedArray;
}
function comparePaillierPublicKey(key1, key2) {
  return key1.n === key2.n && key1.g === key2.g;
}
function compareArrays(arr1, arr2) {
  let arraycomparison = false;
  if (arr1.length === arr2.length) {
    arraycomparison = true;
    for (let i3 = 0; i3 < arr1.length; i3++) {
      if (arr1[i3] !== arr2[i3]) {
        arraycomparison = false;
      }
    }
  }
  return arraycomparison;
}
function checkOwnKeys(keys, object) {
  return keys.every((key) => object.hasOwnProperty(key));
}
async function randomNum(n3 = 32) {
  return Uint8ArraytoBigint(await b(n3));
}
function randBelow(num) {
  return y(BigInt(num) - BigInt(1), BigInt(1));
}
function randomCurveScalar() {
  return randBelow(CURVE.n);
}

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/keygen/KeyGenMessage1.js
var KeyGenMessage1 = class _KeyGenMessage1 {
  constructor(sessionId, commitment1, commitment2) {
    this.sessionId = sessionId;
    this.commitment1 = commitment1;
    this.commitment2 = commitment2;
  }
  toObj() {
    return {
      phase: _KeyGenMessage1.phase,
      session_id: this.sessionId,
      commitment_1: this.commitment1,
      commitment_2: this.commitment2
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_KeyGenMessage1.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _KeyGenMessage1.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const commitment1 = message.commitment_1;
    const commitment2 = message.commitment_2;
    return new _KeyGenMessage1(sessionId, commitment1, commitment2);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _KeyGenMessage1.fromObj(message);
  }
};
KeyGenMessage1.phase = "key_gen_message_1";
KeyGenMessage1.requiredFields = [
  "phase",
  "session_id",
  "commitment_1",
  "commitment_2"
];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/DLogProof.js
var DLogProof = class _DLogProof {
  constructor(t2, s2) {
    this.t = t2;
    this.s = s2;
  }
  static async _hashList(lst) {
    const h2 = await sha256(lst);
    return Uint8ArraytoBigint(new Uint8Array(h2));
  }
  static async _hashPoints(points, sid, pid) {
    const xList = [];
    points.forEach((point) => {
      xList.push(bigintToUint8Array(point.x));
    });
    xList.push(hexToUint8Array(sid));
    xList.push(stringToUint8Array(pid));
    const xListConcat = concatUint8Arrays(xList);
    return await this._hashList(xListConcat);
  }
  static async prove(x, y2, sid, pid) {
    const r3 = await randomNum(32);
    const t2 = this.G.multiply(r3);
    const c = await this._hashPoints([this.G, y2, t2], sid, pid);
    const s2 = (r3 + c * x) % this.q;
    return new _DLogProof(t2, s2);
  }
  async verify(y2, sid, pid) {
    const c = await _DLogProof._hashPoints([_DLogProof.G, y2, this.t], sid, pid);
    const lhs = _DLogProof.G.multiply(this.s);
    const rhs = this.t.add(y2.multiply(c));
    return lhs.equals(rhs);
  }
  toObj() {
    return {
      t: pointTob64(this.t),
      s: bigintTob64(this.s)
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_DLogProof.requiredFields, message)) {
      throw new Error("DLogProof object invalid");
    }
    const t2 = b64ToPoint(message.t);
    const s2 = b64ToBigint(message.s);
    return new _DLogProof(t2, s2);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _DLogProof.fromObj(message);
  }
};
DLogProof.G = Point.BASE;
DLogProof.q = CURVE.n;
DLogProof.requiredFields = ["t", "s"];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/keygen/KeyGenMessage2.js
var KeyGenMessage2 = class _KeyGenMessage2 {
  constructor(sessionId, q22, dLogProof1, e22, dLogProof2) {
    this.sessionId = sessionId;
    this.q2 = q22;
    this.dLogProof1 = dLogProof1;
    this.e2 = e22;
    this.dLogProof2 = dLogProof2;
  }
  toObj() {
    return {
      phase: _KeyGenMessage2.phase,
      session_id: this.sessionId,
      q2: pointTob64(this.q2),
      dlog_proof_1: this.dLogProof1.toObj(),
      e2: pointTob64(this.e2),
      dlog_proof_2: this.dLogProof2.toObj()
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_KeyGenMessage2.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _KeyGenMessage2.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const q22 = b64ToPoint(message.q2);
    const dLogProof1 = DLogProof.fromObj(message.dlog_proof_1);
    const e22 = b64ToPoint(message.e2);
    const dLogProof2 = DLogProof.fromObj(message.dlog_proof_2);
    return new _KeyGenMessage2(sessionId, q22, dLogProof1, e22, dLogProof2);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _KeyGenMessage2.fromObj(message);
  }
};
KeyGenMessage2.phase = "key_gen_message_2";
KeyGenMessage2.requiredFields = [
  "phase",
  "session_id",
  "q2",
  "dlog_proof_1",
  "e2",
  "dlog_proof_2"
];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/pDLProof/PDLwSlackProof.js
var PDLwSlackProof = class _PDLwSlackProof {
  constructor(z, u1, u2, u3, s1, s2, s3) {
    this.z = z;
    this.u1 = u1;
    this.u2 = u2;
    this.u3 = u3;
    this.s1 = s1;
    this.s2 = s2;
    this.s3 = s3;
  }
  toObj() {
    return {
      z: bigintTob64(this.z),
      u1: pointTob64(this.u1),
      u2: bigintTob64(this.u2),
      u3: bigintTob64(this.u3),
      s1: bigintTob64(this.s1),
      s2: bigintTob64(this.s2),
      s3: bigintTob64(this.s3)
    };
  }
  to_str() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_PDLwSlackProof.requiredFields, message)) {
      throw new Error("PDLwSlackProof object invalid");
    }
    const z = b64ToBigint(message.z);
    const u1 = b64ToPoint(message.u1);
    const u2 = b64ToBigint(message.u2);
    const u3 = b64ToBigint(message.u3);
    const s1 = b64ToBigint(message.s1);
    const s2 = b64ToBigint(message.s2);
    const s3 = b64ToBigint(message.s3);
    return new _PDLwSlackProof(z, u1, u2, u3, s1, s2, s3);
  }
  static async prove(witness, statement, sid, pid) {
    const q3 = _PDLwSlackProof.q ** BigInt(3);
    const qNTilde = _PDLwSlackProof.q * statement.nTilde;
    const q3NTilde = q3 * statement.nTilde;
    const alpha = randBelow(q3);
    const beta = randBelow(statement.ek.n);
    const rho = randBelow(qNTilde);
    const gamma = randBelow(q3NTilde);
    const z = commitment_unknown_order(statement.h1, statement.h2, statement.nTilde, witness.x, rho);
    const u1 = statement.G.multiply(modPositive(alpha, _PDLwSlackProof.q));
    const u2 = commitment_unknown_order(statement.ek.n + BigInt(1), beta, statement.ek._n2, alpha, statement.ek.n);
    const u3 = commitment_unknown_order(statement.h1, statement.h2, statement.nTilde, alpha, gamma);
    const data = [];
    data.push(pointToBytes(statement.G));
    data.push(pointToBytes(statement.Q));
    data.push(bigintToUint8Array(statement.ciphertext));
    data.push(bigintToUint8Array(z));
    data.push(pointToBytes(u1));
    data.push(bigintToUint8Array(u2));
    data.push(bigintToUint8Array(u3));
    data.push(hexToUint8Array(sid));
    data.push(stringToUint8Array(pid));
    const concatData = concatUint8Arrays(data);
    const h2 = await sha256(concatData);
    const e3 = Uint8ArraytoBigint(new Uint8Array(h2));
    const s1 = e3 * witness.x + alpha;
    const s2 = commitment_unknown_order(witness.r, beta, statement.ek.n, e3, BigInt(1));
    const s3 = e3 * rho + gamma;
    return new _PDLwSlackProof(z, u1, u2, u3, s1, s2, s3);
  }
  async verify(statement, sid, pid) {
    const data = [];
    data.push(pointToBytes(statement.G));
    data.push(pointToBytes(statement.Q));
    data.push(bigintToUint8Array(statement.ciphertext));
    data.push(bigintToUint8Array(this.z));
    data.push(pointToBytes(this.u1));
    data.push(bigintToUint8Array(this.u2));
    data.push(bigintToUint8Array(this.u3));
    data.push(hexToUint8Array(sid));
    data.push(stringToUint8Array(pid));
    const concatData = concatUint8Arrays(data);
    const h2 = await sha256(concatData);
    const e3 = Uint8ArraytoBigint(new Uint8Array(h2));
    const gS1 = statement.G.multiply(modPositive(this.s1, _PDLwSlackProof.q));
    const eFeNeg = _PDLwSlackProof.q - e3;
    const yMinusE = statement.Q.multiply(eFeNeg);
    const u1Test = gS1.add(yMinusE);
    const u2TestTmp = commitment_unknown_order(statement.ek.n + BigInt(1), this.s2, statement.ek._n2, this.s1, statement.ek.n);
    const u2Test = commitment_unknown_order(u2TestTmp, statement.ciphertext, statement.ek._n2, BigInt(1), -e3);
    const u3TestTmp = commitment_unknown_order(statement.h1, statement.h2, statement.nTilde, this.s1, this.s3);
    const u3Test = commitment_unknown_order(u3TestTmp, this.z, statement.nTilde, BigInt(1), -e3);
    return this.u1.equals(u1Test) && this.u2 === u2Test && this.u3 === u3Test;
  }
};
PDLwSlackProof.requiredFields = ["z", "u1", "u2", "u3", "s1", "s2", "s3"];
PDLwSlackProof.q = CURVE.n;
function commitment_unknown_order(h1, h2, nTilde, x, r3) {
  const h1X = bigintModPow(h1, x, nTilde);
  let h2R;
  if (r3 < 0) {
    const h2Inv = bigintModInv(h2, nTilde);
    h2R = bigintModPow(h2Inv, -r3, nTilde);
  } else {
    h2R = bigintModPow(h2, r3, nTilde);
  }
  return modPositive(h1X * h2R, nTilde);
}

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/wiDLogProof/CompositeDLogProof.js
var CompositeDLogProof = class _CompositeDLogProof {
  constructor(x, y2) {
    this.x = x;
    this.y = y2;
  }
  static async prove(dLogStatement, secret, sid, pid) {
    const bits = _CompositeDLogProof.K + _CompositeDLogProof.K_PRIME + _CompositeDLogProof.SAMPLE_S;
    const R2 = BigInt(2) ** bits;
    const r3 = randBelow(R2);
    const x = bigintModPow(dLogStatement.g, r3, dLogStatement.N);
    const data = [
      bigintToUint8Array(x),
      bigintToUint8Array(dLogStatement.g),
      bigintToUint8Array(dLogStatement.N),
      bigintToUint8Array(dLogStatement.ni),
      hexToUint8Array(sid),
      stringToUint8Array(pid)
    ];
    const concatData = concatUint8Arrays(data);
    const h2 = await sha256(concatData);
    const e3 = Uint8ArraytoBigint(new Uint8Array(h2));
    const y2 = r3 + e3 * secret;
    return new _CompositeDLogProof(x, y2);
  }
  async verify(dLogStatement, sid, pid) {
    if (!(dLogStatement.N > BigInt(2) ** _CompositeDLogProof.K))
      return false;
    if (bigintGcd(dLogStatement.g, dLogStatement.N) !== BigInt(1))
      return false;
    if (bigintGcd(dLogStatement.ni, dLogStatement.N) !== BigInt(1))
      return false;
    const data = [
      bigintToUint8Array(this.x),
      bigintToUint8Array(dLogStatement.g),
      bigintToUint8Array(dLogStatement.N),
      bigintToUint8Array(dLogStatement.ni),
      hexToUint8Array(sid),
      stringToUint8Array(pid)
    ];
    const concatData = concatUint8Arrays(data);
    const h2 = await sha256(concatData);
    const e3 = Uint8ArraytoBigint(new Uint8Array(h2));
    const niE = bigintModPow(dLogStatement.ni, e3, dLogStatement.N);
    const gY = bigintModPow(dLogStatement.g, this.y, dLogStatement.N);
    const gYNiE = modPositive(gY * niE, dLogStatement.N);
    return this.x === gYNiE;
  }
  toObj() {
    return {
      x: bigintTob64(this.x),
      y: bigintTob64(this.y)
    };
  }
  to_str() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_CompositeDLogProof.requiredFields, message)) {
      throw new Error("CompositeDLogProof object invalid");
    }
    const x = b64ToBigint(message.x);
    const y2 = b64ToBigint(message.y);
    return new _CompositeDLogProof(x, y2);
  }
  static fromString(messageString) {
    const message = JSON.parse(messageString);
    return _CompositeDLogProof.fromObj(message);
  }
};
CompositeDLogProof.K = BigInt(128);
CompositeDLogProof.K_PRIME = BigInt(128);
CompositeDLogProof.SAMPLE_S = BigInt(256);
CompositeDLogProof.requiredFields = ["x", "y"];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/NICorrectKeyProof.js
var NICorrectKeyProof = class _NICorrectKeyProof {
  constructor(sigmaVec) {
    this.sigmaVec = sigmaVec;
  }
  static async _maskGeneration(outLength, seed) {
    const mskLen = outLength / _NICorrectKeyProof.DIGEST_SIZE + BigInt(1);
    const mskLenHashVec = [];
    for (let i3 = 0; i3 < mskLen; i3++) {
      const data = [seed, bigintToUint8Array(BigInt(i3), 4)];
      const formattedData = concatUint8Arrays(data);
      const h2 = await sha256(formattedData);
      mskLenHashVec.push(new Uint8Array(h2));
    }
    const msklenHashVecConcat = concatUint8Arrays(mskLenHashVec);
    return Uint8ArraytoBigint(msklenHashVecConcat);
  }
  static async _rhoVec(publicN, keyLength, sid, pid) {
    const resultVector = [];
    const sidBytes = hexToUint8Array(sid);
    const pidBytes = stringToUint8Array(pid);
    for (let i3 = 0; i3 < _NICorrectKeyProof.M2; i3++) {
      const encoder = new TextEncoder();
      const data = [
        bigintToUint8Array(publicN),
        encoder.encode(_NICorrectKeyProof.salt),
        bigintToUint8Array(BigInt(i3), 4),
        sidBytes,
        pidBytes
      ];
      const formattedData = concatUint8Arrays(data);
      const seedBn = await sha256(formattedData);
      let value = await _NICorrectKeyProof._maskGeneration(BigInt(keyLength), new Uint8Array(seedBn));
      value = modPositive(value, publicN);
      resultVector.push(value);
    }
    return resultVector;
  }
  static _crtRecombine(rp, rq, p2, q3, pinv) {
    const diff = modPositive(rq - rp, q3);
    const u2 = modPositive(diff * pinv, q3);
    const x = rp + u2 * p2;
    return x;
  }
  static _extractNRoot(paillierPrivateKey, value) {
    const p2 = paillierPrivateKey._p;
    const q3 = paillierPrivateKey._q;
    const zp = modPositive(value, p2);
    const zq = modPositive(value, q3);
    const n3 = p2 * q3;
    const pminusone = p2 - BigInt(1);
    const qminusone = q3 - BigInt(1);
    const phi = pminusone * qminusone;
    const dn = bigintModInv(n3, phi);
    const dp = modPositive(dn, pminusone);
    const dq = modPositive(dn, qminusone);
    const pinv = bigintModInv(p2, q3);
    const rp = bigintModPow(zp, dp, p2);
    const rq = bigintModPow(zq, dq, q3);
    return _NICorrectKeyProof._crtRecombine(rp, rq, p2, q3, pinv);
  }
  static async prove(paillierPrivateKey, sid, pid) {
    const publicKey = paillierPrivateKey.publicKey;
    const publicN = publicKey.n;
    const keyLength = publicKey.bitLength;
    const rhoVec = await _NICorrectKeyProof._rhoVec(publicN, keyLength, sid, pid);
    const sigmaVec = [];
    rhoVec.forEach((rhoValue) => {
      sigmaVec.push(_NICorrectKeyProof._extractNRoot(paillierPrivateKey, rhoValue));
    });
    return new _NICorrectKeyProof(sigmaVec);
  }
  async verify(paillierPublicKey, sid, pid) {
    const publicN = paillierPublicKey.n;
    const keyLength = paillierPublicKey.bitLength;
    const rhoVec = await _NICorrectKeyProof._rhoVec(publicN, keyLength, sid, pid);
    const gcdTest = bigintGcd(_NICorrectKeyProof.alphaPrimorial, publicN);
    const derivedRhoVec = [];
    this.sigmaVec.forEach((item) => {
      derivedRhoVec.push(bigintModPow(item, publicN, publicN));
    });
    const cond1 = compareArrays(rhoVec, derivedRhoVec);
    const cond2 = gcdTest === BigInt(1);
    return cond1 && cond2;
  }
  toObj() {
    const sigmaVec = [];
    this.sigmaVec.forEach((item) => {
      sigmaVec.push(bigintTob64(item));
    });
    return {
      sigma_vec: sigmaVec
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_NICorrectKeyProof.requiredFields, message)) {
      throw new Error("NICorrectKeyProof object invalid");
    }
    const sigmaVec = [];
    message.sigma_vec.forEach((item) => {
      sigmaVec.push(b64ToBigint(item));
    });
    return new _NICorrectKeyProof(sigmaVec);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _NICorrectKeyProof.fromObj(message);
  }
};
NICorrectKeyProof.requiredFields = ["sigma_vec"];
NICorrectKeyProof.salt = "SilenceLaboratories";
NICorrectKeyProof.M2 = BigInt(11);
NICorrectKeyProof.DIGEST_SIZE = BigInt(256);
NICorrectKeyProof.alphaPrimorial = BigInt("44871651744009136248115543081640547413785854417842050160655833875792914833852769205831424979368719986889519256934239452438251108738670217298542180982547421007901019408155961940142468907900676141149633188172029947498666222471142795699128314649438784106402197023949268047384343715946006767671319388463922366703585708460135453240679421061304864609915827908896062350138633849514905858373339528086006145373712431756746905467935232935398951226852071323775412278763371089401544920873813490290672436809231516731065356763193493525160238868779310055137922174496115680527519932793977258424479253973670103634070028863591207614649216492780891961054287421831028229266989697058385612003557825398202548657910983931484180193293615175594925895929359108723671212631368891689462486968022029482413912928883488902454913524492340322599922718890878760895105937402913873414377276608236656947832307175090505396675623505955607363683869194683635689701238311577953994900734498406703176954324494694474545570839360607926610248093452739817614097197031607820417729009847465138388398887861935127785385309564525648905444610640901769290645369888935446477559073843982605496992468605588284307311971153579731703863970674466666844817336319390617551354845025116350295041840093627836067370100384861820888752358520276041000456608056339377573485917445104757987800101659688183150320442308091835974182809184299472568260682774683272697993855730500061223160274918361373258473553412704497335663924406111413972911417644029226449602417135116011968946232623154008710271296183350215563946003547561056456285939676838623311370087238225630994506113422922846572616538637723054222166159389475617214681282874373185283568512603887750846072033376432252677883915884203823739988948315257311383912016966925295975180180438969999175030785077627458887411146486902613291202008193902979800279637509789564807502239686755727063367075758492823731724669702442450502667810890608807091448688985203084972035197770874223259420649055450382725355162738490355628688943706634905982449810389530661328557381850782677221561924983234877936783136471890539395124220965982831778882400224156689487137227198030461624542872774217771594215907203725682315714199249588874271661233929713660269883273404764648327455796699366900022345171030564747210542398285078804310752063852249740561571105640741618793118627170070315410588646442647771802031066589341358879304845579387079972404386434238273904239604603511925708377008467129590636257287965232576327580009018475271364237665836186806027331208426256451429549641988386585949300254487647395222785274120561299318070944530096970076560461229486504018773252771360855091191876004370694539453020462096690084476681253865429278552786361828508910022714749051734108364178374765700925133405508684883070");

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/pDLProof/PDLwSlackStatement.js
var PDLwSlackStatement = class _PDLwSlackStatement {
  constructor(ciphertext, ek, Q, G3, h1, h2, nTilde) {
    this.ciphertext = ciphertext;
    this.ek = ek;
    this.Q = Q;
    this.G = G3;
    this.h1 = h1;
    this.h2 = h2;
    this.nTilde = nTilde;
  }
  toObj() {
    return {
      ciphertext: bigintTob64(this.ciphertext),
      ek: bigintTob64(this.ek.n),
      Q: pointTob64(this.Q),
      G: pointTob64(this.G),
      h1: bigintTob64(this.h1),
      h2: bigintTob64(this.h2),
      N_tilde: bigintTob64(this.nTilde)
    };
  }
  to_str() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_PDLwSlackStatement.requiredFields, message)) {
      throw new Error("PDLwSlackStatement invalid");
    }
    const ciphertext = b64ToBigint(message.ciphertext);
    const n3 = b64ToBigint(message.ek);
    const ek = new n2(n3, n3 + BigInt(1));
    const Q = b64ToPoint(message.Q);
    const G3 = b64ToPoint(message.G);
    const h1 = b64ToBigint(message.h1);
    const h2 = b64ToBigint(message.h2);
    const nTilde = b64ToBigint(message.N_tilde);
    return new _PDLwSlackStatement(ciphertext, ek, Q, G3, h1, h2, nTilde);
  }
  static fromString(messageString) {
    const message = JSON.parse(messageString);
    return _PDLwSlackStatement.fromObj(message);
  }
};
PDLwSlackStatement.requiredFields = ["ciphertext", "ek", "Q", "G", "h1", "h2", "N_tilde"];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/keygen/KeyGenMessage3.js
var KeyGenMessage3 = class _KeyGenMessage3 {
  constructor(sessionId, q1, dLogProof1, blindFactor1, cKey, paillierPublicKey, nIKeyCorrectProof, pDSwSlackStatement, pDLwSlackProof, compositeDLogProof, e1, dLogProof2, blindFactor2) {
    this.sessionId = sessionId;
    this.q1 = q1;
    this.dLogProof1 = dLogProof1;
    this.blindFactor1 = blindFactor1;
    this.cKey = cKey;
    this.paillierPublicKey = paillierPublicKey;
    this.nIKeyCorrectProof = nIKeyCorrectProof;
    this.pDSwSlackStatement = pDSwSlackStatement;
    this.pDLwSlackProof = pDLwSlackProof;
    this.compositeDLogProof = compositeDLogProof;
    this.e1 = e1;
    this.dLogProof2 = dLogProof2;
    this.blindFactor2 = blindFactor2;
  }
  toJson() {
    return {
      phase: _KeyGenMessage3.phase,
      session_id: this.sessionId,
      q1: pointTob64(this.q1),
      dlog_proof_1: this.dLogProof1.toObj(),
      blind_factor_1: bigintTob64(this.blindFactor1),
      c_key: paillierEncryptedNumberToStr(this.cKey),
      paillier_public_key: paillierPublickeyToStr(this.paillierPublicKey),
      ni_key_correct_proof: this.nIKeyCorrectProof.toObj(),
      pdl_w_slack_statement: this.pDSwSlackStatement.toObj(),
      pdl_w_slack_proof: this.pDLwSlackProof.toObj(),
      composite_dlog_proof: this.compositeDLogProof.toObj(),
      e1: pointTob64(this.e1),
      dlog_proof_2: this.dLogProof2.toObj(),
      blind_factor_2: bigintTob64(this.blindFactor2)
    };
  }
  toStr() {
    return JSON.stringify(this.toJson());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_KeyGenMessage3.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _KeyGenMessage3.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const q1 = b64ToPoint(message.q1);
    const dLogProof1 = DLogProof.fromObj(message.dlog_proof_1);
    const blindFactor1 = b64ToBigint(message.blind_factor_1);
    const cKey = paillierEncryptedNumberFromStr(message.c_key);
    const paillierPublicKey = paillierPublickeyFromStr(message.paillier_public_key);
    const nIKeyCorrectProof = NICorrectKeyProof.fromObj(message.ni_key_correct_proof);
    const pDSwSlackStatement = PDLwSlackStatement.fromObj(message.pdl_w_slack_statement);
    const pDLwSlackProof = PDLwSlackProof.fromObj(message.pdl_w_slack_proof);
    const compositeDLogProof = CompositeDLogProof.fromObj(message.composite_dlog_proof);
    const e1 = b64ToPoint(message.e1);
    const dLogProof2 = DLogProof.fromObj(message.dlog_proof_2);
    const blindFactor2 = b64ToBigint(message.blind_factor_2);
    return new _KeyGenMessage3(sessionId, q1, dLogProof1, blindFactor1, cKey, paillierPublicKey, nIKeyCorrectProof, pDSwSlackStatement, pDLwSlackProof, compositeDLogProof, e1, dLogProof2, blindFactor2);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _KeyGenMessage3.fromObj(message);
  }
};
KeyGenMessage3.phase = "key_gen_message_3";
KeyGenMessage3.requiredFields = [
  "phase",
  "session_id",
  "q1",
  "dlog_proof_1",
  "blind_factor_1",
  "c_key",
  "paillier_public_key",
  "ni_key_correct_proof",
  "pdl_w_slack_statement",
  "pdl_w_slack_proof",
  "composite_dlog_proof",
  "e1",
  "dlog_proof_2",
  "blind_factor_2"
];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/hashCommitment.js
async function createCommitment(q3, dLogProof, blindFactor, sid, pid) {
  const dataList = [q3.x, dLogProof.t.x, dLogProof.s, blindFactor];
  const dataToHashList = [];
  dataList.forEach((value) => {
    dataToHashList.push(bigintToUint8Array(value));
  });
  dataToHashList.push(hexToUint8Array(sid));
  dataToHashList.push(stringToUint8Array(pid));
  const dataToHash = concatUint8Arrays(dataToHashList);
  const hash = await sha256(dataToHash);
  return Uint8ArrayToHex(new Uint8Array(hash));
}
async function verifyCommitment(commitment, q3, dLogProof, blindFactor, sid, pid) {
  const commitmentTest = await createCommitment(q3, dLogProof, blindFactor, sid, pid);
  return commitmentTest === commitment;
}

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/pDLProof/PDLwSlackWitness.js
var PDLwSlackWitness = class {
  constructor(x, r3) {
    this.x = x;
    this.r = r3;
  }
};

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/wiDLogProof/DLogStatement.js
var DLogStatement = class {
  constructor(N, g, ni) {
    this.N = N;
    this.g = g;
    this.ni = ni;
  }
};

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/zkProofs/pDLProof/PDLProof.js
var PDLProof = class _PDLProof {
  static async prove(x1, cKeyRandomness, ek, encryptedShare, sid, pid, keyPair) {
    const { nTilde, h1, h2, xhi } = await generate_h1_h2_n_tilde(keyPair);
    const dLogStatement = new DLogStatement(nTilde, h1, h2);
    const compositeDLogProof = await CompositeDLogProof.prove(dLogStatement, xhi, sid, pid);
    const pDSwSlackStatement = new PDLwSlackStatement(encryptedShare, ek, _PDLProof.G.multiply(x1), _PDLProof.G, dLogStatement.g, dLogStatement.ni, dLogStatement.N);
    const pDLwSlackWitness = new PDLwSlackWitness(x1, cKeyRandomness);
    const pDLwSlackProof = await PDLwSlackProof.prove(pDLwSlackWitness, pDSwSlackStatement, sid, pid);
    return {
      pdl_w_slack_statement: pDSwSlackStatement,
      pdl_w_slack_proof: pDLwSlackProof,
      composite_dlog_proof: compositeDLogProof
    };
  }
  static async verify(compositeDLogProof, pDSwSlackStatement, pDLwSlackProof, paillierPublicKey, encryptedSecretShare, q1, sid, pid) {
    if (!comparePaillierPublicKey(pDSwSlackStatement.ek, paillierPublicKey) || pDSwSlackStatement.ciphertext !== encryptedSecretShare || !pDSwSlackStatement.Q.equals(q1)) {
      return false;
    }
    const dlogStatement = new DLogStatement(pDSwSlackStatement.nTilde, pDSwSlackStatement.h1, pDSwSlackStatement.h2);
    const cond1 = await compositeDLogProof.verify(dlogStatement, sid, pid);
    const cond2 = await pDLwSlackProof.verify(pDSwSlackStatement, sid, pid);
    return cond1 && cond2;
  }
};
PDLProof.G = Point.BASE;
async function generate_h1_h2_n_tilde(keyPair) {
  const ekTilde = keyPair.publicKey;
  const dkTilde = keyPair.privateKey;
  const phi = (dkTilde._p - BigInt(1)) * (dkTilde._q - BigInt(1));
  const h1 = randBelow(phi);
  const s2 = BigInt(2) ** BigInt(256);
  const xhi = randBelow(s2);
  const h1Inv = bigintModInv(h1, ekTilde.n);
  const h2 = bigintModPow(h1Inv, xhi, ekTilde.n);
  const nTilde = ekTilde.n;
  return { nTilde, h1, h2, xhi };
}

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/P1KeyShare.js
var P1KeyShare = class _P1KeyShare {
  constructor(x1, publicKey, paillierPrivateKey, paillierPublicKey) {
    this.x1 = x1;
    this.publicKey = publicKey;
    this.paillierPrivateKey = paillierPrivateKey;
    this.paillierPublicKey = paillierPublicKey;
  }
  toObj() {
    return {
      x1: bigintToHex(this.x1),
      public_key: pointToHex(this.publicKey),
      paillier_private_key: paillierPrivateKeyToObj(this.paillierPrivateKey),
      paillier_public_key: paillierPublickeyToStr(this.paillierPublicKey)
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(obj) {
    if (!checkOwnKeys(_P1KeyShare.requiredFields, obj)) {
      throw new Error("Object invalid");
    }
    const x1 = hexToBigint(obj.x1);
    const publicKey = hexToPoint(obj.public_key);
    const paillierPrivateKey = paillierPrivateKeyFromObj(obj.paillier_private_key);
    const paillierPublicKey = paillierPublickeyFromStr(obj.paillier_public_key);
    return new _P1KeyShare(x1, publicKey, paillierPrivateKey, paillierPublicKey);
  }
  static fromStr(objString) {
    const obj = JSON.parse(objString);
    return _P1KeyShare.fromObj(obj);
  }
};
P1KeyShare.requiredFields = [
  "x1",
  "public_key",
  "paillier_private_key",
  "paillier_public_key"
];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/keygen/KeyGenFailed.js
var KeyGenFailed = class extends Error {
  constructor(message) {
    super(message);
    this.name = "KeyGenFailed";
  }
};

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/common.js
var PARTY_ID_1 = "party1";
var PARTY_ID_2 = "party2";

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/keygen/P1KeyGen.js
var P1KeyGenState;
(function(P1KeyGenState2) {
  P1KeyGenState2[P1KeyGenState2["COMPLETE"] = 0] = "COMPLETE";
  P1KeyGenState2[P1KeyGenState2["FAILED"] = -1] = "FAILED";
  P1KeyGenState2[P1KeyGenState2["NOT_INITIALIZED"] = -2] = "NOT_INITIALIZED";
  P1KeyGenState2[P1KeyGenState2["CREATE_KEY_GEN_MSG_1"] = 1] = "CREATE_KEY_GEN_MSG_1";
  P1KeyGenState2[P1KeyGenState2["PROCESS_KEY_GEN_MSG_2"] = 2] = "PROCESS_KEY_GEN_MSG_2";
})(P1KeyGenState || (P1KeyGenState = {}));
var P1KeyGen = class _P1KeyGen {
  constructor(sessionId, x1, expectedPublicKey) {
    this.sessionId = sessionId;
    this.expectedPublicKey = expectedPublicKey;
    if (x1) {
      if (x1.length !== 32) {
        throw new KeyGenFailed("Invalid length of x1");
      }
      this.x1 = modPositive(Uint8ArraytoBigint(x1), _P1KeyGen.q);
    } else {
      this.x1 = randomCurveScalar();
    }
    this._state = P1KeyGenState.NOT_INITIALIZED;
    this.paillierPublicKey = null;
    this.paillierPrivateKey = null;
    this.q1 = null;
    this.dLogProof1 = null;
    this.blindFactor1 = null;
    this.eph1 = null;
    this.e1 = null;
    this.dLogProof2 = null;
    this.blindFactor2 = null;
    this.paillierKeyPairForProof = null;
  }
  toObj() {
    const d2 = {
      sessionId: this.sessionId,
      x1: bigintTob64(this.x1),
      paillierPublicKey: null,
      paillierPrivateKey: null,
      q1: null,
      dLogProof1: null,
      blindFactor1: null,
      eph1: null,
      e1: null,
      dLogProof2: null,
      blindFactor2: null,
      paillierKeyPairForProof: null,
      expectedPublicKey: null,
      state: this._state
    };
    if (this.paillierPublicKey) {
      d2.paillierPublicKey = paillierPublickeyToStr(this.paillierPublicKey);
    }
    if (this.paillierPrivateKey) {
      d2.paillierPrivateKey = paillierPrivateKeyToObj(this.paillierPrivateKey);
    }
    if (this.q1) {
      d2.q1 = pointTob64(this.q1);
    }
    if (this.dLogProof1) {
      d2.dLogProof1 = this.dLogProof1.toObj();
    }
    if (this.blindFactor1) {
      d2.blindFactor1 = bigintTob64(this.blindFactor1);
    }
    if (this.eph1) {
      d2.eph1 = bigintTob64(this.eph1);
    }
    if (this.e1) {
      d2.e1 = pointTob64(this.e1);
    }
    if (this.dLogProof2) {
      d2.dLogProof2 = this.dLogProof2.toObj();
    }
    if (this.blindFactor2) {
      d2.blindFactor2 = bigintTob64(this.blindFactor2);
    }
    if (this.paillierKeyPairForProof) {
      d2.paillierKeyPairForProof = {
        publicKey: paillierPublickeyToStr(this.paillierKeyPairForProof.publicKey),
        privateKey: paillierPrivateKeyToObj(this.paillierKeyPairForProof.privateKey)
      };
    }
    if (this.expectedPublicKey) {
      d2.expectedPublicKey = this.expectedPublicKey;
    }
    return d2;
  }
  static fromObj(obj) {
    if (!checkOwnKeys(_P1KeyGen.requiredFields, obj)) {
      throw new Error("Invalid obj");
    }
    const sessionId = obj.sessionId;
    const x1 = b64ToBigint(obj.x1);
    let expectedPublicKey;
    if (obj.expectedPublicKey)
      expectedPublicKey = obj.expectedPublicKey;
    const keyGenObj = new _P1KeyGen(sessionId, bigintToUint8Array(x1), expectedPublicKey);
    keyGenObj._state = obj.state;
    if (obj.paillierPublicKey)
      keyGenObj.paillierPublicKey = paillierPublickeyFromStr(obj.paillierPublicKey);
    if (obj.paillierPublicKey)
      keyGenObj.paillierPrivateKey = paillierPrivateKeyFromObj(obj.paillierPrivateKey);
    if (obj.q1)
      keyGenObj.q1 = b64ToPoint(obj.q1);
    if (obj.dLogProof1)
      keyGenObj.dLogProof1 = DLogProof.fromObj(obj.dLogProof1);
    if (obj.blindFactor1)
      keyGenObj.blindFactor1 = b64ToBigint(obj.blindFactor1);
    if (obj.eph1)
      keyGenObj.eph1 = b64ToBigint(obj.eph1);
    if (obj.e1)
      keyGenObj.e1 = b64ToPoint(obj.e1);
    if (obj.dLogProof2)
      keyGenObj.dLogProof2 = DLogProof.fromObj(obj.dLogProof2);
    if (obj.blindFactor2)
      keyGenObj.blindFactor2 = b64ToBigint(obj.blindFactor2);
    if (obj.paillierKeyPairForProof) {
      keyGenObj.paillierKeyPairForProof = {
        publicKey: paillierPublickeyFromStr(obj.paillierKeyPairForProof.publicKey),
        privateKey: paillierPrivateKeyFromObj(obj.paillierKeyPairForProof.privateKey)
      };
    }
    return keyGenObj;
  }
  static getInstanceForKeyRefresh(sessionId, p1KeyShareObj) {
    const p1KeyShare = P1KeyShare.fromObj(p1KeyShareObj);
    const expectedPublicKey = pointToHex(p1KeyShare.publicKey);
    const x1Uint8Array = bigintToUint8Array(p1KeyShare.x1);
    return new _P1KeyGen(sessionId, x1Uint8Array, expectedPublicKey);
  }
  async init(keyPair1, keyPair2) {
    if (keyPair1 && keyPair2) {
      this.paillierPrivateKey = keyPair1.privateKey;
      this.paillierPublicKey = keyPair1.publicKey;
      this.paillierKeyPairForProof = keyPair2;
    } else {
      const [paillierKeyPair, paillierKeyPairForProof] = await Promise.all([
        o2(2048, true),
        o2(2048, true)
      ]);
      this.paillierPrivateKey = paillierKeyPair.privateKey;
      this.paillierPublicKey = paillierKeyPair.publicKey;
      this.paillierKeyPairForProof = paillierKeyPairForProof;
    }
    this._state = P1KeyGenState.CREATE_KEY_GEN_MSG_1;
  }
  isActive() {
    const cond1 = this._state !== P1KeyGenState.NOT_INITIALIZED;
    const cond2 = this._state !== P1KeyGenState.FAILED;
    const cond3 = this._state !== P1KeyGenState.COMPLETE;
    return cond1 && cond2 && cond3;
  }
  async getKeyGenMessage1() {
    if (this._state !== P1KeyGenState.CREATE_KEY_GEN_MSG_1) {
      this._state = P1KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid state");
    }
    this.q1 = _P1KeyGen.G.multiply(this.x1);
    this.dLogProof1 = await DLogProof.prove(this.x1, this.q1, this.sessionId, PARTY_ID_1);
    this.blindFactor1 = await randomNum(32);
    const commitment1 = await createCommitment(this.q1, this.dLogProof1, this.blindFactor1, this.sessionId, PARTY_ID_1);
    this.eph1 = randomCurveScalar();
    this.e1 = _P1KeyGen.G.multiply(this.eph1);
    this.dLogProof2 = await DLogProof.prove(this.eph1, this.e1, this.sessionId, PARTY_ID_1);
    this.blindFactor2 = await randomNum(32);
    const commitment2 = await createCommitment(this.e1, this.dLogProof2, this.blindFactor2, this.sessionId, PARTY_ID_1);
    const keyGenMessage1 = new KeyGenMessage1(this.sessionId, commitment1, commitment2);
    this._state = P1KeyGenState.PROCESS_KEY_GEN_MSG_2;
    return keyGenMessage1;
  }
  async _processKeyGenMessage2(keyGenMessage2) {
    if (this._state !== P1KeyGenState.PROCESS_KEY_GEN_MSG_2) {
      this._state = P1KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid state");
    }
    if (this.sessionId !== keyGenMessage2.sessionId) {
      this._state = P1KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid sessionId");
    }
    const q22 = keyGenMessage2.q2;
    const dLogProof1 = keyGenMessage2.dLogProof1;
    if (!await dLogProof1.verify(q22, this.sessionId, PARTY_ID_2)) {
      this._state = P1KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid dLogProof1");
    }
    const publicKey = q22.multiply(this.x1);
    if (this.expectedPublicKey !== void 0) {
      if (this.expectedPublicKey !== pointToHex(publicKey)) {
        this._state = P1KeyGenState.FAILED;
        throw new KeyGenFailed("Invalid publicKey");
      }
    }
    const e22 = keyGenMessage2.e2;
    const dLogProof2 = keyGenMessage2.dLogProof2;
    if (!await dLogProof2.verify(e22, this.sessionId, PARTY_ID_2)) {
      this._state = P1KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid dLogProof2");
    }
    const ephPoint = e22.multiply(this.eph1);
    const rotateValue1 = ephPoint.x;
    this.x1 = modPositive(this.x1 * rotateValue1, _P1KeyGen.q);
    const nICorrectKeyProof = await NICorrectKeyProof.prove(this.paillierPrivateKey, this.sessionId, PARTY_ID_1);
    const randomness = randBelow(this.paillierPublicKey?.n);
    const cKeyX1 = this.paillierPublicKey?.encrypt(this.x1, randomness);
    const { pdl_w_slack_statement, pdl_w_slack_proof, composite_dlog_proof } = await PDLProof.prove(this.x1, randomness, this.paillierPublicKey, cKeyX1, this.sessionId, PARTY_ID_1, this.paillierKeyPairForProof);
    const keyGenMessage3 = await new KeyGenMessage3(this.sessionId, this.q1, this.dLogProof1, this.blindFactor1, cKeyX1, this.paillierPublicKey, nICorrectKeyProof, pdl_w_slack_statement, pdl_w_slack_proof, composite_dlog_proof, this.e1, this.dLogProof2, this.blindFactor2);
    const keyShare = new P1KeyShare(this.x1, publicKey, this.paillierPrivateKey, this.paillierPublicKey);
    this._state = P1KeyGenState.COMPLETE;
    return {
      key_gen_msg_3: keyGenMessage3,
      p1_key_share: keyShare
    };
  }
  async processMessage(messageString) {
    if (!this.isActive()) {
      throw new KeyGenFailed("KeyGen was already Completed or Failed");
    }
    if (messageString == null) {
      const keyGenMessage1 = await this.getKeyGenMessage1();
      return {
        msg_to_send: keyGenMessage1.toStr(),
        p1_key_share: null
      };
    }
    const messageObj = JSON.parse(messageString);
    const messageSessionId = messageObj.session_id;
    if (this.sessionId !== messageSessionId)
      throw new Error("Invalid sessionId");
    try {
      if (this._state === P1KeyGenState.PROCESS_KEY_GEN_MSG_2) {
        const keyGenMessage2 = KeyGenMessage2.fromStr(messageString);
        const { key_gen_msg_3, p1_key_share } = await this._processKeyGenMessage2(keyGenMessage2);
        return {
          msg_to_send: key_gen_msg_3.toStr(),
          p1_key_share: p1_key_share.toObj()
        };
      }
    } catch (e3) {
      this._state = P1KeyGenState.FAILED;
      throw e3;
    }
    this._state = P1KeyGenState.FAILED;
    throw new KeyGenFailed("");
  }
};
P1KeyGen.requiredFields = [
  "sessionId",
  "x1",
  "paillierPublicKey",
  "paillierPrivateKey",
  "q1",
  "dLogProof1",
  "blindFactor1",
  "eph1",
  "e1",
  "dLogProof2",
  "blindFactor2",
  "paillierKeyPairForProof",
  "expectedPublicKey",
  "state"
];
P1KeyGen.G = Point.BASE;
P1KeyGen.q = CURVE.n;

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/P2KeyShare.js
var P2KeyShare = class _P2KeyShare {
  constructor(x2, publicKey, cKeyX1, paillierPublicKey) {
    this.x2 = x2;
    this.publicKey = publicKey;
    this.cKeyX1 = cKeyX1;
    this.paillierPublicKey = paillierPublicKey;
  }
  toObj() {
    return {
      x2: bigintToHex(this.x2),
      public_key: pointToHex(this.publicKey),
      c_key_x1: bigintTob64(this.cKeyX1),
      paillier_public_key: paillierPublickeyToStr(this.paillierPublicKey)
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(obj) {
    if (!checkOwnKeys(_P2KeyShare.requiredFields, obj)) {
      throw new Error("Object invalid");
    }
    const x2 = hexToBigint(obj.x2);
    const publicKey = hexToPoint(obj.public_key);
    const cKeyX1 = b64ToBigint(obj.c_key_x1);
    const paillierPublicKey = paillierPublickeyFromStr(obj.paillier_public_key);
    return new _P2KeyShare(x2, publicKey, cKeyX1, paillierPublicKey);
  }
  static fromStr(objString) {
    const obj = JSON.parse(objString);
    return _P2KeyShare.fromObj(obj);
  }
};
P2KeyShare.requiredFields = [
  "x2",
  "public_key",
  "c_key_x1",
  "paillier_public_key"
];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/keygen/P2KeyGen.js
var P2KeyGenState;
(function(P2KeyGenState2) {
  P2KeyGenState2[P2KeyGenState2["COMPLETE"] = 0] = "COMPLETE";
  P2KeyGenState2[P2KeyGenState2["FAILED"] = -1] = "FAILED";
  P2KeyGenState2[P2KeyGenState2["PROCESS_KEY_GEN_MSG_1"] = 1] = "PROCESS_KEY_GEN_MSG_1";
  P2KeyGenState2[P2KeyGenState2["PROCESS_KEY_GEN_MSG_3"] = 2] = "PROCESS_KEY_GEN_MSG_3";
})(P2KeyGenState || (P2KeyGenState = {}));
var P2KeyGen = class _P2KeyGen {
  constructor(sessionId, x2, expectedPublicKey) {
    this.sessionId = sessionId;
    this.expectedPublicKey = expectedPublicKey;
    if (x2) {
      if (x2.length !== 32) {
        throw new KeyGenFailed("Invalid length of x1");
      }
      this.x2 = modPositive(Uint8ArraytoBigint(x2), _P2KeyGen.q);
    } else {
      this.x2 = randomCurveScalar();
    }
    this._state = P2KeyGenState.PROCESS_KEY_GEN_MSG_1;
    this.eph2 = null;
    this.commitment1 = null;
    this.commitment2 = null;
  }
  toObj() {
    const d2 = {
      sessionId: this.sessionId,
      x2: bigintTob64(this.x2),
      eph2: null,
      commitment1: null,
      commitment2: null,
      expectedPublicKey: null,
      state: this._state
    };
    if (this.eph2) {
      d2.eph2 = bigintTob64(this.eph2);
    }
    if (this.commitment1) {
      d2.commitment1 = this.commitment1;
    }
    if (this.commitment2) {
      d2.commitment2 = this.commitment2;
    }
    if (this.expectedPublicKey) {
      d2.expectedPublicKey = this.expectedPublicKey;
    }
    return d2;
  }
  static fromObj(obj) {
    if (!checkOwnKeys(_P2KeyGen.requiredFields, obj)) {
      throw new Error("Invalid obj");
    }
    const sessionId = obj.sessionId;
    const x2 = b64ToBigint(obj.x2);
    let expectedPublicKey;
    if (obj.expectedPublicKey)
      expectedPublicKey = obj.expectedPublicKey;
    const keyGenObj = new _P2KeyGen(sessionId, bigintToUint8Array(x2), expectedPublicKey);
    keyGenObj._state = obj.state;
    if (obj.eph2)
      keyGenObj.eph2 = b64ToBigint(obj.eph2);
    if (obj.commitment1)
      keyGenObj.commitment1 = obj.commitment1;
    if (obj.commitment2)
      keyGenObj.commitment2 = obj.commitment2;
    return keyGenObj;
  }
  static getInstanceForKeyRefresh(sessionId, p2KeyShareObj) {
    const p2KeyShare = P2KeyShare.fromObj(p2KeyShareObj);
    const expectedPublicKey = pointToHex(p2KeyShare.publicKey);
    const x2Uint8Array = bigintToUint8Array(p2KeyShare.x2);
    return new _P2KeyGen(sessionId, x2Uint8Array, expectedPublicKey);
  }
  isActive() {
    const cond1 = this._state !== P2KeyGenState.FAILED;
    const cond2 = this._state !== P2KeyGenState.COMPLETE;
    return cond1 && cond2;
  }
  async _processKeyGenMessage1(keyGenMessage1) {
    if (this._state !== P2KeyGenState.PROCESS_KEY_GEN_MSG_1) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid state");
    }
    if (this.sessionId !== keyGenMessage1.sessionId) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid sessionId");
    }
    this.commitment1 = keyGenMessage1.commitment1;
    this.commitment2 = keyGenMessage1.commitment2;
    const q22 = _P2KeyGen.G.multiply(this.x2);
    const dLogProof1 = await DLogProof.prove(this.x2, q22, this.sessionId, PARTY_ID_2);
    this.eph2 = randomCurveScalar();
    const e22 = _P2KeyGen.G.multiply(this.eph2);
    const dLogProof2 = await DLogProof.prove(this.eph2, e22, this.sessionId, PARTY_ID_2);
    const keyGenMessage2 = new KeyGenMessage2(this.sessionId, q22, dLogProof1, e22, dLogProof2);
    this._state = P2KeyGenState.PROCESS_KEY_GEN_MSG_3;
    return keyGenMessage2;
  }
  async _processKeyGenMessage3(keyGenMessage3) {
    if (this._state !== P2KeyGenState.PROCESS_KEY_GEN_MSG_3) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid state");
    }
    if (this.sessionId !== keyGenMessage3.sessionId) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid sessionId");
    }
    const q1 = keyGenMessage3.q1;
    const dLogProof1 = keyGenMessage3.dLogProof1;
    const cond1 = await dLogProof1.verify(q1, this.sessionId, PARTY_ID_1);
    if (!cond1) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid dLogProof1");
    }
    const blindFactor1 = keyGenMessage3.blindFactor1;
    const cond2 = await verifyCommitment(this.commitment1, q1, dLogProof1, blindFactor1, this.sessionId, PARTY_ID_1);
    if (!cond2) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid Commitment1");
    }
    const publicKey = q1.multiply(this.x2);
    if (this.expectedPublicKey !== void 0) {
      if (this.expectedPublicKey !== pointToHex(publicKey)) {
        this._state = P2KeyGenState.FAILED;
        throw new KeyGenFailed("Invalid publicKey");
      }
    }
    const e1 = keyGenMessage3.e1;
    const dLogProof2 = keyGenMessage3.dLogProof2;
    const cond3 = await dLogProof2.verify(e1, this.sessionId, PARTY_ID_1);
    if (!cond3) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid dLogProof2");
    }
    const blindFactor2 = keyGenMessage3.blindFactor2;
    const cond4 = await verifyCommitment(this.commitment2, e1, dLogProof2, blindFactor2, this.sessionId, PARTY_ID_1);
    if (!cond4) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid Commitment2");
    }
    const ephPoint = e1.multiply(this.eph2);
    const rotateValue1 = ephPoint.x;
    const rotateValue2 = bigintModInv(rotateValue1, _P2KeyGen.q);
    const q1Rotated = q1.multiply(rotateValue1);
    this.x2 = modPositive(this.x2 * rotateValue2, _P2KeyGen.q);
    const paillierPublicKey = keyGenMessage3.paillierPublicKey;
    const cond5 = paillierPublicKey.bitLength === 2048;
    if (!cond5) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("PaillierPublicKey.bitLength !== 2048");
    }
    const nIKeyCorrectProof = keyGenMessage3.nIKeyCorrectProof;
    const cond6 = await nIKeyCorrectProof.verify(paillierPublicKey, this.sessionId, PARTY_ID_1);
    if (!cond6) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid nIKeyCorrectProof");
    }
    const cKeyX1 = keyGenMessage3.cKey;
    const pDSwSlackStatement = keyGenMessage3.pDSwSlackStatement;
    const pDLwSlackProof = keyGenMessage3.pDLwSlackProof;
    const compositeDLogProof = keyGenMessage3.compositeDLogProof;
    const cond7 = await PDLProof.verify(compositeDLogProof, pDSwSlackStatement, pDLwSlackProof, paillierPublicKey, cKeyX1, q1Rotated, this.sessionId, PARTY_ID_1);
    if (!cond7) {
      this._state = P2KeyGenState.FAILED;
      throw new KeyGenFailed("Invalid PDLProof");
    }
    const p2KeyShare = new P2KeyShare(this.x2, publicKey, cKeyX1, paillierPublicKey);
    this._state = P2KeyGenState.COMPLETE;
    return p2KeyShare;
  }
  async processMessage(messageString) {
    if (!this.isActive()) {
      throw new KeyGenFailed("KeyGen was already Completed or Failed");
    }
    const messageObj = JSON.parse(messageString);
    const messageSessionId = messageObj.session_id;
    if (this.sessionId !== messageSessionId)
      throw new Error("Invalid sessionId");
    try {
      if (this._state === P2KeyGenState.PROCESS_KEY_GEN_MSG_1) {
        const keyGenMessage1 = KeyGenMessage1.fromStr(messageString);
        const keyGenMessage2 = await this._processKeyGenMessage1(keyGenMessage1);
        return {
          msg_to_send: keyGenMessage2.toStr(),
          p2_key_share: null
        };
      }
      if (this._state === P2KeyGenState.PROCESS_KEY_GEN_MSG_3) {
        const keyGenMessage3 = KeyGenMessage3.fromStr(messageString);
        const p2KeyShare = await this._processKeyGenMessage3(keyGenMessage3);
        return {
          msg_to_send: null,
          p2_key_share: p2KeyShare.toObj()
        };
      }
    } catch (e3) {
      this._state = P2KeyGenState.FAILED;
      throw e3;
    }
    this._state = P2KeyGenState.FAILED;
    throw new KeyGenFailed("");
  }
};
P2KeyGen.requiredFields = [
  "sessionId",
  "x2",
  "eph2",
  "commitment1",
  "commitment2",
  "expectedPublicKey",
  "state"
];
P2KeyGen.G = Point.BASE;
P2KeyGen.q = CURVE.n;

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/SignMessage1.js
var SignMessage1 = class _SignMessage1 {
  constructor(sessionId, commitment) {
    this.sessionId = sessionId;
    this.commitment = commitment;
  }
  toObj() {
    return {
      phase: _SignMessage1.phase,
      session_id: this.sessionId,
      commitment: this.commitment
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_SignMessage1.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _SignMessage1.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const commitment = message.commitment;
    return new _SignMessage1(sessionId, commitment);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _SignMessage1.fromObj(message);
  }
};
SignMessage1.phase = "sign_message_1";
SignMessage1.requiredFields = ["phase", "session_id", "commitment"];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/SignMessage2.js
var SignMessage2 = class _SignMessage2 {
  constructor(sessionId, r22, dLogProof) {
    this.sessionId = sessionId;
    this.r2 = r22;
    this.dLogProof = dLogProof;
  }
  toObj() {
    return {
      phase: _SignMessage2.phase,
      session_id: this.sessionId,
      r2: pointToHex(this.r2),
      dlog_proof: this.dLogProof.toObj()
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_SignMessage2.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _SignMessage2.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const r22 = hexToPoint(message.r2);
    const dLogProof = DLogProof.fromObj(message.dlog_proof);
    return new _SignMessage2(sessionId, r22, dLogProof);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _SignMessage2.fromObj(message);
  }
};
SignMessage2.phase = "sign_message_2";
SignMessage2.requiredFields = ["phase", "session_id", "r2", "dlog_proof"];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/SignMessage3.js
var SignMessage3 = class _SignMessage3 {
  constructor(sessionId, r1, dLogProof, blindFactor) {
    this.sessionId = sessionId;
    this.r1 = r1;
    this.dLogProof = dLogProof;
    this.blindFactor = blindFactor;
  }
  toObj() {
    return {
      phase: _SignMessage3.phase,
      session_id: this.sessionId,
      r1: pointToHex(this.r1),
      dlog_proof: this.dLogProof.toObj(),
      blind_factor: bigintTob64(this.blindFactor)
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_SignMessage3.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _SignMessage3.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const r1 = hexToPoint(message.r1);
    const dLogProof = DLogProof.fromObj(message.dlog_proof);
    const blindFactor = b64ToBigint(message.blind_factor);
    return new _SignMessage3(sessionId, r1, dLogProof, blindFactor);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _SignMessage3.fromObj(message);
  }
};
SignMessage3.phase = "sign_message_3";
SignMessage3.requiredFields = [
  "phase",
  "session_id",
  "r1",
  "dlog_proof",
  "blind_factor"
];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/SignMessage4.js
var SignMessage4 = class _SignMessage4 {
  constructor(sessionId, c3) {
    this.sessionId = sessionId;
    this.c3 = c3;
  }
  toObj() {
    return {
      phase: _SignMessage4.phase,
      session_id: this.sessionId,
      c3: paillierEncryptedNumberToStr(this.c3)
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_SignMessage4.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _SignMessage4.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const c3 = paillierEncryptedNumberFromStr(message.c3);
    return new _SignMessage4(sessionId, c3);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _SignMessage4.fromObj(message);
  }
};
SignMessage4.phase = "sign_message_4";
SignMessage4.requiredFields = ["phase", "session_id", "c3"];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/SignMessage5.js
var SignMessage5 = class _SignMessage5 {
  constructor(sessionId, signature) {
    this.sessionId = sessionId;
    this.signature = signature;
  }
  toObj() {
    return {
      phase: _SignMessage5.phase,
      session_id: this.sessionId,
      signature: this.signature
    };
  }
  toStr() {
    return JSON.stringify(this.toObj());
  }
  static fromObj(message) {
    if (!checkOwnKeys(_SignMessage5.requiredFields, message)) {
      throw new Error("Message invalid");
    }
    if (message.phase !== _SignMessage5.phase) {
      throw new Error("Phase invalid");
    }
    const sessionId = message.session_id;
    const signature = message.signature;
    return new _SignMessage5(sessionId, signature);
  }
  static fromStr(messageString) {
    const message = JSON.parse(messageString);
    return _SignMessage5.fromObj(message);
  }
};
SignMessage5.phase = "sign_message_5";
SignMessage5.requiredFields = ["phase", "session_id", "signature"];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/SignatureFailed.js
var SignatureFailed = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SignatureFailed";
  }
};

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/P1Signature.js
var G = Point.BASE;
var q = CURVE.n;
var Party1SignatureState;
(function(Party1SignatureState2) {
  Party1SignatureState2[Party1SignatureState2["COMPLETE"] = 0] = "COMPLETE";
  Party1SignatureState2[Party1SignatureState2["FAILED"] = -1] = "FAILED";
  Party1SignatureState2[Party1SignatureState2["GET_SIGN_MSG_1"] = 1] = "GET_SIGN_MSG_1";
  Party1SignatureState2[Party1SignatureState2["PROCESS_SIGN_MSG_2"] = 2] = "PROCESS_SIGN_MSG_2";
  Party1SignatureState2[Party1SignatureState2["PROCESS_SIGN_MSG_4"] = 3] = "PROCESS_SIGN_MSG_4";
})(Party1SignatureState || (Party1SignatureState = {}));
var P1Signature = class _P1Signature {
  constructor(sessionId, messageHash, p1KeyShareObj) {
    this.sessionId = sessionId;
    this.messageHash = messageHash;
    this.p1KeyShare = P1KeyShare.fromObj(p1KeyShareObj);
    this._state = Party1SignatureState.GET_SIGN_MSG_1;
    this.recid = null;
    this.k1 = null;
    this.r1 = null;
    this.dLogProof = null;
    this.blindFactor = null;
    this.r = null;
  }
  toObj() {
    const d2 = {
      sessionId: this.sessionId,
      messageHash: Uint8ArrayTob64(this.messageHash),
      p1KeyShare: this.p1KeyShare.toObj(),
      k1: null,
      r1: null,
      dLogProof: null,
      blindFactor: null,
      r: null,
      recid: this.recid,
      state: this._state
    };
    if (this.k1 != null && this.k1 !== void 0) {
      d2.k1 = bigintTob64(this.k1);
    }
    if (this.r1 != null && this.r1 !== void 0) {
      d2.r1 = pointTob64(this.r1);
    }
    if (this.dLogProof != null && this.dLogProof !== void 0) {
      d2.dLogProof = this.dLogProof.toObj();
    }
    if (this.blindFactor !== null && this.blindFactor !== void 0) {
      d2.blindFactor = bigintTob64(this.blindFactor);
    }
    if (this.r !== null && this.r !== void 0) {
      d2.r = bigintTob64(this.r);
    }
    return d2;
  }
  static fromObj(obj) {
    if (!checkOwnKeys(_P1Signature.requiredFields, obj)) {
      throw new Error("Invalid obj");
    }
    const sessionId = obj.sessionId;
    const messageHash = b64ToUint8Array(obj.messageHash);
    const signObj = new _P1Signature(sessionId, messageHash, obj.p1KeyShare);
    signObj._state = obj.state;
    if (obj.k1)
      signObj.k1 = b64ToBigint(obj.k1);
    if (obj.r1)
      signObj.r1 = b64ToPoint(obj.r1);
    if (obj.dLogProof)
      signObj.dLogProof = DLogProof.fromObj(obj.dLogProof);
    if (obj.blindFactor)
      signObj.blindFactor = b64ToBigint(obj.blindFactor);
    if (obj.r)
      signObj.r = b64ToBigint(obj.r);
    if (obj.recid !== null)
      signObj.recid = obj.recid;
    return signObj;
  }
  isActive() {
    const cond1 = this._state !== Party1SignatureState.FAILED;
    const cond2 = this._state !== Party1SignatureState.COMPLETE;
    return cond1 && cond2;
  }
  async _getSignMessage1() {
    if (this._state !== Party1SignatureState.GET_SIGN_MSG_1) {
      this._state = Party1SignatureState.FAILED;
      throw new SignatureFailed("Invalid state");
    }
    this.k1 = randomCurveScalar();
    this.r1 = G.multiply(this.k1);
    this.dLogProof = await DLogProof.prove(this.k1, this.r1, this.sessionId, PARTY_ID_1);
    this.blindFactor = await randomNum(32);
    const commitment = await createCommitment(this.r1, this.dLogProof, this.blindFactor, this.sessionId, PARTY_ID_1);
    const signMessage1 = new SignMessage1(this.sessionId, commitment);
    this._state = Party1SignatureState.PROCESS_SIGN_MSG_2;
    return signMessage1;
  }
  async _processSignMessage2(signMessage2) {
    if (this._state !== Party1SignatureState.PROCESS_SIGN_MSG_2) {
      this._state = Party1SignatureState.FAILED;
      throw new SignatureFailed("Invalid state");
    }
    if (this.sessionId !== signMessage2.sessionId) {
      this._state = Party1SignatureState.FAILED;
      throw new SignatureFailed("Invalid sessionId");
    }
    const r22 = signMessage2.r2;
    const dLogProof = signMessage2.dLogProof;
    const cond1 = await dLogProof.verify(r22, this.sessionId, PARTY_ID_2);
    if (!cond1) {
      this._state = Party1SignatureState.FAILED;
      throw new SignatureFailed("Invalid dLogProof");
    }
    const rUpper = r22.multiply(this.k1);
    this.r = modPositive(rUpper.x, q);
    const yBytes = bigintToUint8Array(rUpper.y);
    this.recid = yBytes[yBytes.length - 1] % 2 === 0 ? 0 : 1;
    const signMessage3 = new SignMessage3(this.sessionId, this.r1, this.dLogProof, this.blindFactor);
    this._state = Party1SignatureState.PROCESS_SIGN_MSG_4;
    return signMessage3;
  }
  async _processSignMessage4(signMessage4) {
    if (this._state !== Party1SignatureState.PROCESS_SIGN_MSG_4) {
      this._state = Party1SignatureState.FAILED;
      throw new SignatureFailed("Invalid state");
    }
    if (this.sessionId !== signMessage4.sessionId) {
      this._state = Party1SignatureState.FAILED;
      throw new SignatureFailed("Invalid sessionId");
    }
    const c3 = signMessage4.c3;
    const s1 = this.p1KeyShare.paillierPrivateKey.decrypt(c3);
    const s2 = modPositive(bigintModInv(this.k1, q) * s1, q);
    const sPrime = q - s2;
    let s3;
    if (this.recid === null) {
      throw new Error("recid is null");
    }
    if (s2 < sPrime) {
      s3 = s2;
    } else {
      s3 = sPrime;
      this.recid = this.recid === 0 ? 1 : 0;
    }
    const signature = signatureToHex(this.r, s3);
    try {
      const signatureIsCorrect = await verifySignature(this.messageHash, this.p1KeyShare.publicKey, signature);
      if (!signatureIsCorrect) {
        throw new SignatureFailed("Invalid signature");
      }
    } catch (e3) {
      this._state = Party1SignatureState.FAILED;
      throw e3;
    }
    const signMessage5 = new SignMessage5(this.sessionId, signature);
    this._state = Party1SignatureState.COMPLETE;
    if (this.recid === null) {
      throw new Error("recid is null");
    }
    return { signMessage5, signature, recid: this.recid };
  }
  async processMessage(messageString) {
    if (!this.isActive()) {
      throw new SignatureFailed("Signature was already Completed or Failed");
    }
    if (messageString == null) {
      const signMessage1 = await this._getSignMessage1();
      return {
        msg_to_send: signMessage1.toStr(),
        signature: null
      };
    }
    const messageObj = JSON.parse(messageString);
    const messageSessionId = messageObj.session_id;
    if (this.sessionId !== messageSessionId)
      throw new Error("Invalid sessionId");
    try {
      if (this._state === Party1SignatureState.PROCESS_SIGN_MSG_2) {
        const signMessage2 = SignMessage2.fromStr(messageString);
        const signMessage3 = await this._processSignMessage2(signMessage2);
        return {
          msg_to_send: signMessage3.toStr(),
          signature: null
        };
      }
      if (this._state === Party1SignatureState.PROCESS_SIGN_MSG_4) {
        const signMessage4 = SignMessage4.fromStr(messageString);
        const { signMessage5, signature, recid } = await this._processSignMessage4(signMessage4);
        return {
          msg_to_send: signMessage5.toStr(),
          signature,
          recid
        };
      }
    } catch (e3) {
      this._state = Party1SignatureState.FAILED;
      throw e3;
    }
    this._state = Party1SignatureState.FAILED;
    throw new SignatureFailed("");
  }
};
P1Signature.requiredFields = [
  "sessionId",
  "messageHash",
  "p1KeyShare",
  "k1",
  "r1",
  "dLogProof",
  "blindFactor",
  "r",
  "recid",
  "state"
];

// node_modules/@silencelaboratories/ecdsa-tss/lib/esm/ecdsa/signature/P2Signature.js
var G2 = Point.BASE;
var q2 = CURVE.n;
var Party2SignatureState;
(function(Party2SignatureState2) {
  Party2SignatureState2[Party2SignatureState2["COMPLETE"] = 0] = "COMPLETE";
  Party2SignatureState2[Party2SignatureState2["FAILED"] = -1] = "FAILED";
  Party2SignatureState2[Party2SignatureState2["PROCESS_SIGN_MSG_1"] = 1] = "PROCESS_SIGN_MSG_1";
  Party2SignatureState2[Party2SignatureState2["PROCESS_SIGN_MSG_3"] = 2] = "PROCESS_SIGN_MSG_3";
  Party2SignatureState2[Party2SignatureState2["PROCESS_SIGN_MSG_5"] = 3] = "PROCESS_SIGN_MSG_5";
})(Party2SignatureState || (Party2SignatureState = {}));
var P2Signature = class _P2Signature {
  constructor(sessionId, messageHash, p2KeyShareObj) {
    this.commitment = "";
    this.sessionId = sessionId;
    this.messageHash = messageHash;
    this.p2KeyShare = P2KeyShare.fromObj(p2KeyShareObj);
    this._state = Party2SignatureState.PROCESS_SIGN_MSG_1;
    this.k2 = null;
  }
  toObj() {
    const d2 = {
      sessionId: this.sessionId,
      messageHash: Uint8ArrayTob64(this.messageHash),
      p2KeyShare: this.p2KeyShare.toObj(),
      k2: null,
      commitment: null,
      state: this._state
    };
    if (this.k2) {
      d2.k2 = bigintTob64(this.k2);
    }
    if (this.commitment) {
      d2.commitment = this.commitment;
    }
    return d2;
  }
  static fromObj(obj) {
    if (!checkOwnKeys(_P2Signature.requiredFields, obj)) {
      throw new Error("Invalid obj");
    }
    const sessionId = obj.sessionId;
    const messageHash = b64ToUint8Array(obj.messageHash);
    const signObj = new _P2Signature(sessionId, messageHash, obj.p2KeyShare);
    signObj._state = obj.state;
    if (obj.k2)
      signObj.k2 = b64ToBigint(obj.k2);
    if (obj.commitment)
      signObj.commitment = obj.commitment;
    return signObj;
  }
  isActive() {
    const cond1 = this._state !== Party2SignatureState.FAILED;
    const cond2 = this._state !== Party2SignatureState.COMPLETE;
    return cond1 && cond2;
  }
  async _processSignMessage1(signMessage1) {
    if (this._state !== Party2SignatureState.PROCESS_SIGN_MSG_1) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid state");
    }
    if (this.sessionId !== signMessage1.sessionId) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid sessionId");
    }
    this.commitment = signMessage1.commitment;
    this.k2 = randomCurveScalar();
    const r22 = G2.multiply(this.k2);
    const dLogProof = await DLogProof.prove(this.k2, r22, this.sessionId, PARTY_ID_2);
    const signMessage2 = new SignMessage2(this.sessionId, r22, dLogProof);
    this._state = Party2SignatureState.PROCESS_SIGN_MSG_3;
    return signMessage2;
  }
  async _processSignMessage3(signMessage3) {
    if (this._state !== Party2SignatureState.PROCESS_SIGN_MSG_3) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid state");
    }
    if (this.sessionId !== signMessage3.sessionId) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid sessionId");
    }
    const r1 = signMessage3.r1;
    const dLogProof = signMessage3.dLogProof;
    const con1 = await dLogProof.verify(r1, this.sessionId, PARTY_ID_1);
    if (!con1) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid dLogProof");
    }
    const blindFactor = signMessage3.blindFactor;
    const cond2 = await verifyCommitment(this.commitment, r1, dLogProof, blindFactor, this.sessionId, PARTY_ID_1);
    if (!cond2) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid Commitment");
    }
    const paillierPublicKey = this.p2KeyShare.paillierPublicKey;
    const cKeyX1 = this.p2KeyShare.cKeyX1;
    const rUpper = r1.multiply(this.k2);
    const r3 = modPositive(rUpper.x, q2);
    const m2 = Uint8ArraytoBigint(this.messageHash);
    const ro = randBelow(q2 ** 2n);
    const k2Inv = bigintModInv(this.k2, q2);
    const c1 = paillierPublicKey.encrypt(ro * q2 + modPositive(k2Inv * m2, q2));
    const v = k2Inv * r3 * this.p2KeyShare.x2;
    const c2 = paillierPublicKey.multiply(cKeyX1, v);
    const c3 = paillierPublicKey.addition(c1, c2);
    const signMessage4 = new SignMessage4(this.sessionId, c3);
    this._state = Party2SignatureState.PROCESS_SIGN_MSG_5;
    return signMessage4;
  }
  async _processSignMessage5(signMessage5) {
    if (this._state !== Party2SignatureState.PROCESS_SIGN_MSG_5) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid state");
    }
    if (this.sessionId !== signMessage5.sessionId) {
      this._state = Party2SignatureState.FAILED;
      throw new SignatureFailed("Invalid sessionId");
    }
    const signature = signMessage5.signature;
    try {
      const signatureIsCorrect = await verifySignature(this.messageHash, this.p2KeyShare.publicKey, signature);
      if (!signatureIsCorrect) {
        throw new SignatureFailed("Invalid signature");
      }
    } catch (e3) {
      this._state = Party2SignatureState.FAILED;
      throw e3;
    }
    this._state = Party2SignatureState.COMPLETE;
    return signature;
  }
  async processMessage(messageString) {
    if (!this.isActive()) {
      throw new SignatureFailed("Signature was already Completed or Failed");
    }
    const messageObj = JSON.parse(messageString);
    const messageSessionId = messageObj.session_id;
    if (this.sessionId !== messageSessionId)
      throw new Error("Invalid sessionId");
    try {
      if (this._state === Party2SignatureState.PROCESS_SIGN_MSG_1) {
        const signMessage1 = SignMessage1.fromStr(messageString);
        const signMessage2 = await this._processSignMessage1(signMessage1);
        return {
          msg_to_send: signMessage2.toStr(),
          signature: null
        };
      }
      if (this._state === Party2SignatureState.PROCESS_SIGN_MSG_3) {
        const signMessage3 = SignMessage3.fromStr(messageString);
        const signMessage4 = await this._processSignMessage3(signMessage3);
        return {
          msg_to_send: signMessage4.toStr(),
          signature: null
        };
      }
      if (this._state === Party2SignatureState.PROCESS_SIGN_MSG_5) {
        const signMessage5 = SignMessage5.fromStr(messageString);
        const signature = await this._processSignMessage5(signMessage5);
        return {
          msg_to_send: null,
          signature
        };
      }
    } catch (e3) {
      this._state = Party2SignatureState.FAILED;
      throw e3;
    }
    this._state = Party2SignatureState.FAILED;
    throw new SignatureFailed("");
  }
};
P2Signature.requiredFields = [
  "sessionId",
  "messageHash",
  "p2KeyShare",
  "k2",
  "commitment",
  "state"
];

// src/p1client.ts
async function ed_p1Keygen(api) {
  const { wsUrl, sessionId, frostWasm } = api;
  if (!frostWasm) {
    throw new Error("frost-wasm is not initialized");
  }
  const round1Result = JSON.parse(frostWasm.ed_dkg_round1(1, 2, 2));
  const p1Round1Secret = round1Result.secret_package;
  const p1Round1Package = JSON.parse(round1Result.package);
  const sock = new MPCSocket(wsUrl);
  await sock.open();
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ed_keygen",
    sessionId,
    payload: JSON.stringify({ round: 1, package: p1Round1Package })
  });
  const resp2 = await sock.waitOne();
  if (resp2.purpose !== "ed_keygen" || resp2.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 2 message");
  }
  const p2RoundData = JSON.parse(resp2.payload);
  const p2Round1PackageRaw = p2RoundData.round1_package;
  const p2Round2PackageRaw = p2RoundData.round2_package;
  const p2Round1Package = typeof p2Round1PackageRaw === "string" ? JSON.parse(p2Round1PackageRaw) : p2Round1PackageRaw;
  const p2Round2Package = typeof p2Round2PackageRaw === "string" ? JSON.parse(p2Round2PackageRaw) : p2Round2PackageRaw;
  const round2Packages = { "0200000000000000000000000000000000000000000000000000000000000000": p2Round1Package };
  const round2Result = JSON.parse(
    frostWasm.ed_dkg_round2(p1Round1Secret, JSON.stringify(round2Packages))
  );
  const p1Round2Secret = round2Result.secret_package;
  const p1Round2Package = JSON.parse(round2Result.package);
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ed_keygen",
    sessionId,
    payload: JSON.stringify({ round: 2, package: p1Round2Package })
  });
  const resp3 = await sock.waitOne();
  if (resp3.purpose !== "ed_keygen" || resp3.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 3 message");
  }
  const p2Round3Data = JSON.parse(resp3.payload);
  const p2Round1PackageForRound3Raw = p2Round3Data.round1_package;
  const p2Round2PackageForRound3Raw = p2Round3Data.round2_package;
  const p2Round1PackageForRound3 = typeof p2Round1PackageForRound3Raw === "string" ? JSON.parse(p2Round1PackageForRound3Raw) : p2Round1PackageForRound3Raw;
  const p2Round2PackageForRound3Map = typeof p2Round2PackageForRound3Raw === "string" ? JSON.parse(p2Round2PackageForRound3Raw) : p2Round2PackageForRound3Raw;
  const p1Id = "0100000000000000000000000000000000000000000000000000000000000000";
  const p2Round2PackageForP1 = p2Round2PackageForRound3Map[p1Id];
  if (!p2Round2PackageForP1) {
    throw new Error(`P2 Round2 package for P1 (${p1Id}) not found in package map`);
  }
  const round1PackagesForRound3 = {
    "0200000000000000000000000000000000000000000000000000000000000000": p2Round1Package
  };
  const p2Id = "0200000000000000000000000000000000000000000000000000000000000000";
  const round2PackagesForRound3 = {
    [p2Id]: p2Round2PackageForP1
  };
  console.log("[P1] DKG Round 3 - Package info:", {
    round1PackagesCount: Object.keys(round1PackagesForRound3).length,
    round1PackagesKeys: Object.keys(round1PackagesForRound3),
    round2PackagesCount: Object.keys(round2PackagesForRound3).length,
    round2PackagesKeys: Object.keys(round2PackagesForRound3)
  });
  const round3Result = JSON.parse(
    frostWasm.ed_dkg_round3(
      p1Round2Secret,
      JSON.stringify(round1PackagesForRound3),
      JSON.stringify(round2PackagesForRound3)
    )
  );
  sock.close();
  const keyPackage = round3Result.key_package;
  const publicKeyPackage = round3Result.public_key_package;
  const publicKey = publicKeyPackage.verifying_key || "";
  return {
    sessionId,
    keyPackage,
    publicKeyPackage,
    publicKey
  };
}
async function ed_p1Sign(api) {
  const { wsUrl, sessionId, messageHash, keyPackage, publicKeyPackage, frostWasm } = api;
  if (!frostWasm) {
    throw new Error("frost-wasm is not initialized");
  }
  const keyPackageStr = typeof keyPackage === "string" ? keyPackage : JSON.stringify(keyPackage);
  const publicKeyPackageStr = typeof publicKeyPackage === "string" ? publicKeyPackage : JSON.stringify(publicKeyPackage);
  const round1Result = JSON.parse(frostWasm.ed_round1_commit(keyPackageStr));
  const p1Nonces = round1Result.nonces;
  const p1CommitmentsRaw = round1Result.commitments;
  const p1Commitments = typeof p1CommitmentsRaw === "string" ? JSON.parse(p1CommitmentsRaw) : p1CommitmentsRaw;
  const sock = new MPCSocket(wsUrl);
  await sock.open();
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ed_sign",
    sessionId,
    payload: JSON.stringify({ round: 1, commitments: p1Commitments })
  });
  const resp2 = await sock.waitOne();
  if (resp2.purpose !== "ed_sign" || resp2.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 2 message");
  }
  const p2RoundData = JSON.parse(resp2.payload);
  const p2CommitmentsRaw = p2RoundData.commitments;
  const p2Commitments = typeof p2CommitmentsRaw === "string" ? JSON.parse(p2CommitmentsRaw) : p2CommitmentsRaw;
  const allCommitments = {
    "0100000000000000000000000000000000000000000000000000000000000000": p1Commitments,
    "0200000000000000000000000000000000000000000000000000000000000000": p2Commitments
  };
  const signingPackage = JSON.parse(
    frostWasm.ed_build_signing_package(messageHash, JSON.stringify(allCommitments))
  );
  const keyPackageStrForSign = typeof keyPackage === "string" ? keyPackage : JSON.stringify(keyPackage);
  const noncesStr = typeof p1Nonces === "string" ? p1Nonces : JSON.stringify(p1Nonces);
  const round2Result = JSON.parse(
    frostWasm.ed_round2_sign(
      keyPackageStrForSign,
      noncesStr,
      JSON.stringify(signingPackage)
    )
  );
  const p1SignatureShare = typeof round2Result.signature_share === "string" ? JSON.parse(round2Result.signature_share) : round2Result.signature_share;
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ed_sign",
    sessionId,
    payload: JSON.stringify({ round: 2, signature_share: p1SignatureShare })
  });
  const resp3 = await sock.waitOne();
  if (resp3.purpose !== "ed_sign" || resp3.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 3 message");
  }
  const p2Round3Data = JSON.parse(resp3.payload);
  const p2SignatureShare = p2Round3Data.signature_share;
  const signatureShares = {
    "0100000000000000000000000000000000000000000000000000000000000000": p1SignatureShare,
    "0200000000000000000000000000000000000000000000000000000000000000": p2SignatureShare
  };
  const finalSignatureResult = JSON.parse(
    frostWasm.ed_aggregate_and_verify(
      JSON.stringify(signingPackage),
      JSON.stringify(signatureShares),
      publicKeyPackageStr
    )
  );
  sock.close();
  const finalSignature = finalSignatureResult.signature || null;
  return { sessionId, signature: finalSignature };
}
async function secp_p1Keygen(api) {
  const { wsUrl, sessionId, frostWasm } = api;
  if (!frostWasm) {
    throw new Error("frost-wasm is not initialized");
  }
  const round1Result = JSON.parse(frostWasm.secp_dkg_round1(1, 2, 2));
  const p1Round1Secret = round1Result.secret_package;
  const p1Round1Package = JSON.parse(round1Result.package);
  const sock = new MPCSocket(wsUrl);
  await sock.open();
  sock.send({
    kind: "P1_TO_P2",
    purpose: "secp_keygen",
    sessionId,
    payload: JSON.stringify({ round: 1, package: p1Round1Package })
  });
  const resp2 = await sock.waitOne();
  if (resp2.purpose !== "secp_keygen" || resp2.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 2 message");
  }
  const p2RoundData = JSON.parse(resp2.payload);
  const p2Round1PackageRaw = p2RoundData.round1_package;
  const p2Round2PackageRaw = p2RoundData.round2_package;
  const p2Round1Package = typeof p2Round1PackageRaw === "string" ? JSON.parse(p2Round1PackageRaw) : p2Round1PackageRaw;
  const p2Round2Package = typeof p2Round2PackageRaw === "string" ? JSON.parse(p2Round2PackageRaw) : p2Round2PackageRaw;
  const round2Packages = { "0000000000000000000000000000000000000000000000000000000000000002": p2Round1Package };
  const round2Result = JSON.parse(
    frostWasm.secp_dkg_round2(p1Round1Secret, JSON.stringify(round2Packages))
  );
  const p1Round2Secret = round2Result.secret_package;
  const p1Round2Package = JSON.parse(round2Result.package);
  sock.send({
    kind: "P1_TO_P2",
    purpose: "secp_keygen",
    sessionId,
    payload: JSON.stringify({ round: 2, package: p1Round2Package })
  });
  const resp3 = await sock.waitOne();
  if (resp3.purpose !== "secp_keygen" || resp3.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 3 message");
  }
  const p2Round3Data = JSON.parse(resp3.payload);
  const p2Round1PackageForRound3Raw = p2Round3Data.round1_package;
  const p2Round2PackageForRound3Raw = p2Round3Data.round2_package;
  const p2Round1PackageForRound3 = typeof p2Round1PackageForRound3Raw === "string" ? JSON.parse(p2Round1PackageForRound3Raw) : p2Round1PackageForRound3Raw;
  const p2Round2PackageForRound3Map = typeof p2Round2PackageForRound3Raw === "string" ? JSON.parse(p2Round2PackageForRound3Raw) : p2Round2PackageForRound3Raw;
  const p1Id = "0000000000000000000000000000000000000000000000000000000000000001";
  const p2Round2PackageForP1 = p2Round2PackageForRound3Map[p1Id];
  if (!p2Round2PackageForP1) {
    throw new Error(`P2 Round2 package for P1 (${p1Id}) not found in package map`);
  }
  const round1PackagesForRound3 = {
    "0000000000000000000000000000000000000000000000000000000000000002": p2Round1Package
  };
  const p2Id = "0000000000000000000000000000000000000000000000000000000000000002";
  const round2PackagesForRound3 = {
    [p2Id]: p2Round2PackageForP1
  };
  const round3Result = JSON.parse(
    frostWasm.secp_dkg_round3(
      p1Round2Secret,
      JSON.stringify(round1PackagesForRound3),
      JSON.stringify(round2PackagesForRound3)
    )
  );
  sock.close();
  const keyPackage = round3Result.key_package;
  const publicKeyPackage = round3Result.public_key_package;
  const publicKey = publicKeyPackage.verifying_key || "";
  return {
    sessionId,
    keyPackage,
    publicKeyPackage,
    publicKey
  };
}
async function secp_p1Sign(api) {
  const { wsUrl, sessionId, messageHash, keyPackage, publicKeyPackage, frostWasm } = api;
  console.log("\u{1F50D} p1client secp_p1Sign: called");
  if (!frostWasm) {
    throw new Error("frost-wasm is not initialized");
  }
  const keyPackageStr = typeof keyPackage === "string" ? keyPackage : JSON.stringify(keyPackage);
  const publicKeyPackageStr = typeof publicKeyPackage === "string" ? publicKeyPackage : JSON.stringify(publicKeyPackage);
  console.log("\u{1F50D} secp_p1Sign: keyPackageStr: ", keyPackageStr);
  const round1Result = JSON.parse(frostWasm.secp_round1_commit(keyPackageStr));
  const p1Nonces = round1Result.nonces;
  const p1CommitmentsRaw = round1Result.commitments;
  const p1Commitments = typeof p1CommitmentsRaw === "string" ? JSON.parse(p1CommitmentsRaw) : p1CommitmentsRaw;
  console.log("\u{1F50D} secp_p1Sign: p1Commitments: ", JSON.stringify(p1Commitments));
  const sock = new MPCSocket(wsUrl);
  await sock.open();
  sock.send({
    kind: "P1_TO_P2",
    purpose: "secp_sign",
    sessionId,
    payload: JSON.stringify({ round: 1, commitments: p1Commitments })
  });
  const resp2 = await sock.waitOne();
  if (resp2.purpose !== "secp_sign" || resp2.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 2 message");
  }
  const p2RoundData = JSON.parse(resp2.payload);
  const p2CommitmentsRaw = p2RoundData.commitments;
  const p2Commitments = typeof p2CommitmentsRaw === "string" ? JSON.parse(p2CommitmentsRaw) : p2CommitmentsRaw;
  const allCommitments = {
    "0000000000000000000000000000000000000000000000000000000000000001": p1Commitments,
    "0000000000000000000000000000000000000000000000000000000000000002": p2Commitments
  };
  console.log("\u{1F50D} secp_p1Sign: allCommitments: ", JSON.stringify(allCommitments));
  const signingPackage = JSON.parse(
    frostWasm.secp_build_signing_package(messageHash, JSON.stringify(allCommitments))
  );
  const keyPackageStrForSign = typeof keyPackage === "string" ? keyPackage : JSON.stringify(keyPackage);
  const noncesStr = typeof p1Nonces === "string" ? p1Nonces : JSON.stringify(p1Nonces);
  console.log("\u{1F50D} secp_p1Sign: keyPackageStrForSign: ", keyPackageStrForSign);
  console.log("\u{1F50D} secp_p1Sign: noncesStr: ", noncesStr);
  console.log("\u{1F50D} secp_p1Sign: signingPackage: ", JSON.stringify(signingPackage));
  const round2Result = JSON.parse(
    frostWasm.secp_round2_sign(
      keyPackageStrForSign,
      noncesStr,
      JSON.stringify(signingPackage)
    )
  );
  console.log("\u{1F50D} secp_p1Sign: round2Result: ", round2Result);
  const p1SignatureShare = JSON.parse(round2Result.signature_share);
  console.log("\u{1F50D} secp_p1Sign: p1SignatureShare: ", p1SignatureShare);
  sock.send({
    kind: "P1_TO_P2",
    purpose: "secp_sign",
    sessionId,
    payload: JSON.stringify({ round: 2, signature_share: p1SignatureShare })
  });
  const resp3 = await sock.waitOne();
  if (resp3.purpose !== "secp_sign" || resp3.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 3 message");
  }
  const p2Round3Data = JSON.parse(resp3.payload);
  const p2SignatureShare = p2Round3Data.signature_share;
  console.log("\u{1F50D} secp_p1Sign: p2SignatureShare: ", p2SignatureShare);
  const signatureShares = {
    "0000000000000000000000000000000000000000000000000000000000000001": p1SignatureShare,
    "0000000000000000000000000000000000000000000000000000000000000002": p2SignatureShare
  };
  console.log("\u{1F50D} secp_p1Sign: signatureShares: ", JSON.stringify(signatureShares));
  console.log("\u{1F50D} secp_p1Sign: signingPackage: ", JSON.stringify(signingPackage));
  console.log("\u{1F50D} secp_p1Sign: publicKeyPackageStr: ", publicKeyPackageStr);
  const finalSignatureResult = JSON.parse(
    frostWasm.secp_aggregate_and_verify(
      JSON.stringify(signingPackage),
      JSON.stringify(signatureShares),
      publicKeyPackageStr
    )
  );
  sock.close();
  const finalSignature = finalSignatureResult.signature || null;
  return { sessionId, signature: finalSignature };
}
async function ecdsa_tss_p1Keygen(api) {
  const { wsUrl, sessionId } = api;
  const p1 = new P1KeyGen(sessionId, await crypto.getRandomValues(new Uint8Array(32)));
  await p1.init();
  const r1 = await p1.processMessage(null);
  const m1 = r1.msg_to_send;
  const sock = new MPCSocket(wsUrl);
  await sock.open();
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ecdsa_tss_keygen",
    sessionId,
    payload: m1
  });
  const resp2 = await sock.waitOne();
  if (resp2.purpose !== "ecdsa_tss_keygen" || resp2.kind !== "P2_TO_P1") {
    throw new Error("Invalid Round 2 message");
  }
  const m2 = resp2.payload;
  const r3 = await p1.processMessage(m2);
  const m3 = r3.msg_to_send;
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ecdsa_tss_keygen",
    sessionId,
    payload: m3
  });
  sock.close();
  if (!r3.p1_key_share)
    throw new Error("p1_key_share missing");
  return {
    sessionId,
    p1KeyShare: r3.p1_key_share,
    publicKey: r3.p1_key_share.public_key
  };
}
async function ecdsa_tss_p1Sign(api) {
  const { wsUrl, sessionId, messageHash, p1KeyShare } = api;
  const p1 = new P1Signature(sessionId, messageHash, p1KeyShare);
  const r1 = await p1.processMessage(null);
  const m1 = r1.msg_to_send;
  const sock = new MPCSocket(wsUrl);
  await sock.open();
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ecdsa_tss_sign",
    sessionId,
    payload: m1
  });
  const resp2 = await sock.waitOne();
  if (resp2.purpose !== "ecdsa_tss_sign" || resp2.kind !== "P2_TO_P1") {
    sock.close();
    throw new Error("Invalid Round 2 message");
  }
  const r22 = await p1.processMessage(resp2.payload);
  const m3 = r22.msg_to_send;
  sock.send({
    kind: "P1_TO_P2",
    purpose: "ecdsa_tss_sign",
    // ここは path なしでOK（P2はすでに保持している設計）
    sessionId,
    payload: m3
  });
  const resp4 = await sock.waitOne();
  if (resp4.purpose !== "ecdsa_tss_sign" || resp4.kind !== "P2_TO_P1") {
    sock.close();
    throw new Error("Invalid Round 4 message");
  }
  const r4 = await p1.processMessage(resp4.payload);
  sock.close();
  return {
    sessionId,
    signature: r4.signature ?? null
  };
}
export {
  ecdsa_tss_p1Keygen,
  ecdsa_tss_p1Sign,
  ed_p1Keygen,
  ed_p1Sign,
  secp_p1Keygen,
  secp_p1Sign
};
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)

@noble/secp256k1/lib/esm/index.js:
  (*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)
*/
