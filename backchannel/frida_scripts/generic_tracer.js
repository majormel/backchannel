var hookId = '{{HOOK_ID}}';
var target = '{{TARGET}}';
var captureArgs = {{CAPTURE_ARGS}};
var captureRetval = {{CAPTURE_RETVAL}};

var addr;
if (target.startsWith('0x')) {
    addr = ptr(target);
} else {
    var resolved = Module.findExportByName(null, target);
    if (!resolved) {
        send({hook_id: hookId, event_type: 'error', data: {message: 'symbol not found: ' + target}});
    }
    addr = resolved;
}

if (addr) {
    Interceptor.attach(addr, {
        onEnter: function(args) {
            var info = {hook_id: hookId, event_type: 'call', data: {target: target}};
            if (captureArgs) {
                info.data.args = [];
                for (var i = 0; i < 6; i++) {
                    info.data.args.push(args[i].toString());
                }
            }
            this._hookId = hookId;
            send(info);
        },
        onLeave: function(retval) {
            if (captureRetval) {
                send({hook_id: this._hookId, event_type: 'return', data: {retval: retval.toString()}});
            }
        }
    });
}
