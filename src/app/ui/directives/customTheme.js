// Better to import this directly instead of a dynamic import to prevent flash of light content. It's small anyway.
import darkThemeCss from '../../../sass/themes/_pm-dark-theme.scss';

/* @ngInject */
const customTheme = (AppModel, dispatchers, mailSettingsModel, organizationModel) => ({
    replace: true,
    template: '<style id="customTheme"></style>',
    link(scope, el) {
        const { on, unsubscribe } = dispatchers();
        const update = () => {
            const { isLoggedIn } = AppModel.query();

            if (isLoggedIn) {
                const { Theme: organizationTheme } = organizationModel.get() || {};
                const userTheme = mailSettingsModel.get('Theme') || '';
                if (userTheme === '/* dark-mode */') {
                    el[0].textContent = organizationTheme || darkThemeCss || '';
                    AppModel.set('darkmode', true);
                } else {
                    AppModel.set('darkmode', false);
                    el[0].textContent = organizationTheme || userTheme || '';
                }
            }
        };

        on('organizationChange', update);
        on('mailSettings', update);
        on('AppModel', update);

        on('logout', () => {
            el[0].textContent = '';
        });

        update();

        scope.$on('$destroy', unsubscribe);
    }
});
export default customTheme;
