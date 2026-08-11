var hookId = '{{HOOK_ID}}';
var kvKey = '0x9f82a3483d9e5089';

function hexFromBuffer(ptr, len) {
    var bytes = [];
    for (var i = 0; i < len; i++) {
        bytes.push(('0' + (ptr.add(i).readU8()).toString(16)).slice(-2));
    }
    return bytes.join('');
}

var writeTargets = ['memcpy', 'memmove'];

writeTargets.forEach(function(name) {
    var addr = Module.findExportByName(null, name);
    if (!addr) return;

    Interceptor.attach(addr, {
        onEnter: function(args) {
            this._dst = args[0];
            this._src = args[1];
            this._len = args[2].toInt32();
        },
        onLeave: function(retval) {
            if (this._len === 8) {
                try {
                    var written = hexFromBuffer(this._dst, 8);
                    if (written.indexOf(kvKey.replace('0x', '')) !== -1) {
                        send({
                            hook_id: hookId,
                            event_type: 'memory',
                            data: {
                                kv_key: kvKey,
                                value_hex: written,
                                dst: this._dst.toString(),
                                function: arguments.callee
                            }
                        });
                    }
                } catch(e) {}
            }
        }
    });
});
