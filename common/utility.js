function getTS() {
    const pad = (num) => num < 10 ? '0' + num : num;
    let date = new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + 
        pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

exports.log = function () {
    console.log(getTS(), ...arguments);
}

exports.error = function () {
    console.error(getTS(), ...arguments);
}