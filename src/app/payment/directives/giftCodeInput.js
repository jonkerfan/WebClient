/* @ngInject */
function giftCodeInput() {
    return {
        replace: true,
        restrict: 'E',
        scope: { form: '=', code: '=' },
        templateUrl: 'templates/payment/giftCodeInput.tpl.html'
    };
}
export default giftCodeInput;
