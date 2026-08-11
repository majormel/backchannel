var hookId = '{{HOOK_ID}}';

function hexFromBuffer(ptr, len) {
    var bytes = [];
    for (var i = 0; i < len; i++) {
        bytes.push(('0' + (ptr.add(i).readU8()).toString(16)).slice(-2));
    }
    return bytes.join('');
}

var targets = [
    {name: 'CCHmac', argCount: 5},
    {name: 'CC_SHA256', argCount: 3},
    {name: 'CCCrypt', argCount: 10}
];

targets.forEach(function(t) {
    var addr = Module.findExportByName(null, t.name);
    if (!addr) return;

    Interceptor.attach(addr, {
        onEnter: function(args) {
            this._fn = t.name;
            var inputLen = args[1].toInt32();
            var inputHex = '';
            if (inputLen > 0 && inputLen < 4096) {
                try {
                    inputHex = hexFromBuffer(args[0], inputLen);
                } catch(e) {}
            }
            send({
                hook_id: hookId,
                event_type: 'call',
                data: {function: t.name, input_hex: inputHex, input_len: inputLen}
            });
        },
        onLeave: function(retval) {
            send({
                hook_id: hookId,
                event_type: 'return',
                data: {function: this._fn, retval: retval.toString()}
            });
        }
    });
});
