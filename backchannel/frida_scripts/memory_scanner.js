var pattern = '{{PATTERN}}';
var baseAddress = ptr('{{ADDRESS}}');
var scanSize = {{SIZE}};

Memory.scan(baseAddress, scanSize, pattern, {
    onMatch: function(address, size) {
        send({type: 'match', address: address.toString(), size: size});
    },
    onComplete: function() {
        send({type: 'scan_complete'});
    },
    onError: function(reason) {
        send({type: 'scan_error', reason: reason});
    }
});
