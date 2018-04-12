import _ from 'lodash';
import { MIME_TYPES } from '../../constants';

const { PLAINTEXT } = MIME_TYPES;

/* @ngInject */
function ComposeMessageController(
    $filter,
    $scope,
    $state,
    $stateParams,
    $timeout,
    addressesModel,
    AppModel,
    authentication,
    cache,
    composerFromModel,
    composerRequestModel,
    confirmModal,
    CONSTANTS,
    dispatchers,
    $rootScope,
    embedded,
    encryptMessage,
    eventManager,
    extractDataURI,
    attachPublicKey,
    gettextCatalog,
    hotkeys,
    mailSettingsModel,
    messageBuilder,
    messageModel,
    messageRequest,
    networkActivityTracker,
    notification,
    outsidersMap,
    plusAliasModel,
    postMessage,
    sendMessage,
    validateMessage
) {
    const { dispatcher, on, unsubscribe } = dispatchers(['composer.update', 'messageActions']);

    $scope.messages = [];
    $scope.uid = 1;

    /**
     * Store ids of current opened composer
     * @param  {String} ID    ID of the message
     * @param  {Boolean} clear to remove the ID
     * @return {void}
     */
    const commitComposer = ({ ID, ConversationID }, clear) => {
        const list = AppModel.get('composerList') || [];

        if (!clear) {
            return AppModel.store('composerList', (list.push({ ID, ConversationID }), list));
        }
        AppModel.store('composerList', list.filter((item) => item.ID !== ID));
    };

    // Listeners
    const unsubscribeWatcher = $scope.$watch('messages.length', () => {
        if ($scope.messages.length > 0) {
            AppModel.set('activeComposer', true);

            window.onbeforeunload = () => {
                return gettextCatalog.getString(
                    'By leaving now, you will lose what you have written in this email. You can save a draft if you want to come back to it later on.',
                    null
                );
            };
            hotkeys.pause(); // Pause hotkeys
        } else {
            AppModel.set('activeComposer', false);
            window.onbeforeunload = undefined;

            if (mailSettingsModel.get('Hotkeys') === 1) {
                hotkeys.unpause();
            } else {
                hotkeys.pause();
            }
        }
    });

    on('updateUser', () => {
        $scope.addresses = addressesModel.get();
    });

    on('onDrag', () => {
        _.each($scope.messages, (message) => {
            $scope.togglePanel(message, 'attachments');
        });
    });

    // When the user delete a conversation and a message is a part of this conversation
    on('deleteConversation', (event, ID) => {
        _.each($scope.messages, (message) => {
            if (ID === message.ID) {
                // Close the composer
                $scope.close(message, false, false);
            }
        });
    });

    const isSent = ({ Type } = {}) => Type === CONSTANTS.INBOX_AND_SENT || Type === CONSTANTS.SENT;

    on('app.event', (event, { type, data }) => {
        switch (type) {
            case 'activeMessages': {
                // If you send the current draft from another tab/app we need to remove it from the composerList
                const removed = $scope.messages.filter(({ ID = '' }) => {
                    const msg = _.find(data.messages, { ID });
                    return msg && isSent(msg);
                });

                removed.length &&
                    removed.forEach((message) => {
                        closeComposer(message);
                        !isSent(message) &&
                            notification.info(gettextCatalog.getString('Email was already sent', null, 'Info'));
                    });

                break;
            }
        }
    });

    // When a message is updated we try to update the message
    on('message.refresh', (event, messageIDs) => {
        $scope.messages.forEach((message) => {
            const { ID } = message;
            if (messageIDs.indexOf(ID) > -1) {
                const messageCached = cache.getMessageCached(ID);

                if (messageCached) {
                    message.Time = messageCached.Time;
                    message.ConversationID = messageCached.ConversationID;
                }
            }
        });
    });

    on('composer.new', async (e, { type, data = {} }) => {
        const limitReached = checkComposerNumber();
        if (!limitReached && AppModel.is('onLine')) {
            validateMessage.canWrite() && initMessage(await messageBuilder.create(type, data.message));
        }
    });

    on('composer.load', async (e, { data: { ID } }) => {
        const found = _.find($scope.messages, { ID });
        const limitReached = checkComposerNumber();

        if (found || limitReached) {
            return;
        }
        try {
            const message = await cache.queryMessage(ID);
            await message.clearTextBody();
            /**
             * Init and prepare the message as if we are replying or forwarding. i.e. try to load embedded content and blacklist all transformers.
             * This sanitizes and removes unwanted content, e.g. remote content if that is specified to not load by default.
             * Use 'reply' as the action to transformEmbedded in prepareContent.
             * See #6645
             * Don't prepare plaintext messages because they are converted to html when sanitized.
             */
            const isDraftPlainText = message.isPlainText() && message.IsEncrypted === 5;
            const preparedMessage = isDraftPlainText ? message : messageBuilder.prepare(message, 'reply');
            await initMessage(preparedMessage);
            await commitComposer(preparedMessage);
        } catch (e) {
            notification.error(e);
        }
    });

    on('hotkeys', (e, { type }) => {
        if (type === 'save') {
            $scope.$applyAsync(() => {
                const message = _.find($scope.messages, { focussed: true });

                if (message) {
                    postMessage(message, {
                        autosaving: true,
                        notification: true
                    });
                }
            });
        }
    });

    on('composer.update', (e, { type, data }) => {
        switch (type) {
            case 'loaded':
                commitComposer(data.message);
                break;

            case 'editor.focus': {
                const { message, isMessage } = data;
                isMessage &&
                    $scope.$applyAsync(() => {
                        message.autocompletesFocussed = false;
                        message.attachmentsToggle = false;
                        message.ccbcc = false;
                    });
                break;
            }

            case 'send.message': {
                $scope.send(data.message);
                break;
            }

            case 'send.success':
            case 'close.message': {
                $scope.close(data.message, data.discard, data.save);
                break;
            }

            case 'close.panel': {
                $scope.closePanel(data.message);
                break;
            }
        }
    });

    on('message', (e, { type, data: { message } }) => {
        // save when DOM is updated
        type === 'updated' && postMessage(message, { autosaving: true });
    });

    on('plaintextarea', (e, { type, data }) => {
        type === 'input' && $scope.saveLater(data.message);
    });

    on('squire.editor', (e, { type, data }) => {
        type === 'input' && $scope.saveLater(data.message);
    });

    on('attachment.upload', (e, { type, data }) => {
        if (type === 'remove.success' && data.message.MIMEType !== PLAINTEXT) {
            postMessage(data.message, { autosaving: true });
        }
    });

    const onResize = _.debounce(() => {
        dispatcher['composer.update']('refresh', { size: $scope.messages.length });
    }, 1000);

    /**
     * Check if the user reach the composer number limit
     * @return {Boolean}
     */
    function checkComposerNumber() {
        const limit =
            $scope.messages.length >= CONSTANTS.MAX_NUMBER_COMPOSER ||
            ($scope.messages.length === 1 && AppModel.is('mobile'));

        if (limit) {
            notification.error(
                gettextCatalog.getString(
                    'Maximum composer reached',
                    null,
                    `Notify the user when he try to open more than ${CONSTANTS.MAX_NUMBER_COMPOSER} composer`
                )
            );
        }

        return limit;
    }

    $(window).on('resize', onResize);

    $scope.$on('$destroy', () => {
        $(window).off('resize', onResize);

        window.onbeforeunload = undefined;

        unsubscribeWatcher();
        unsubscribe();
    });

    $scope.slideDown = (message) => {
        message.attachmentsToggle = !message.attachmentsToggle;
    };

    $scope.isEmbedded = (attachment) => {
        return embedded.isEmbedded(attachment);
    };

    /**
     * Bind the From configuration to a message and update the AddressID if we need to
     * @param  {Object}
     * @return {Object}
     */
    function bindFrom(message) {
        const { address } = composerFromModel.get(message);

        return {
            From: address,
            AddressID: address.ID
        };
    }

    /**
     * Add message in composer list
     * @param {Object} message
     */
    function initMessage(message) {
        if (mailSettingsModel.get('ComposerMode') === 1) {
            message.maximized = true;
            AppModel.set('maximizedComposer', true);
        }

        message.attachmentsToggle =
            message.Attachments.length - message.NumEmbedded > 0 && message.Attachments.length > message.NumEmbedded;
        message.ccbcc = false;
        message.autocompletesFocussed = false;

        message.uid = $scope.uid++;
        message.pendingAttachements = [];
        message.askEmbedding = false;
        delete message.asEmbedded;
        message.uploading = 0;
        message.sending = false;

        const { From } = bindFrom(message);
        message.From = From;

        $scope.$applyAsync(() => {
            const size = $scope.messages.unshift(message);

            postMessage(message)
                .then(() => {
                    dispatcher['composer.update']('loaded', { size, message });
                })
                .catch(() => {
                    const [, ...list] = $scope.messages;
                    $scope.messages = list;
                });
        });
    }

    $scope.togglePanel = (message, panelName) => {
        if (message.displayPanel === true) {
            $scope.closePanel(message);
        } else {
            $scope.openPanel(message, panelName);
        }
    };

    $scope.openPanel = (message, panelName) => {
        message.displayPanel = true;
        message.panelName = panelName;

        if (panelName === 'encrypt') {
            $timeout(
                () => {
                    angular.element('#uid' + message.uid + ' input[name="outsidePw"]').focus();
                },
                100,
                false
            );
        }
    };

    $scope.closePanel = (message) => {
        message.displayPanel = false;
        message.panelName = '';
    };

    /**
     * Delay the saving
     * @param {Object} message
     */
    $scope.saveLater = (message) => {
        if (message.sending || message.discardDontAutoSave) {
            return;
        }
        postMessage(message, { autosaving: true, loader: false });
    };

    $scope.save = (message, notification = false, autosaving = false) => {
        const msg = messageModel(message);
        return embedded.parser(msg, { direction: 'cid' }).then((result) => {
            msg.Body = result;
            return postMessage(msg, { notification, autosaving });
        });
    };

    /**
     * Return the subject title of the composer
     */
    $scope.subject = (message) => {
        return message.Subject || gettextCatalog.getString('New message', null, 'Title');
    };

    function dispatchMessageAction(message) {
        $rootScope.$emit('actionMessage', { data: message });
    }

    const wait = (delay) => {
        return new Promise((resolve) => {
            setTimeout(resolve, delay);
        });
    };

    /**
     * Try to send message specified
     * @param {Object} message
     */
    $scope.send = async (msg) => {
        // Prevent mutability
        const message = messageModel(msg);
        const setStateSending = (is) => ((message.sending = is), (msg.sending = is));

        setStateSending(true);

        message.Password = message.Password || '';
        message.PasswordHint = message.PasswordHint || '';

        try {
            await validateMessage.checkSubject(message);
        } catch (e) {
            setStateSending(false);
            return;
        }

        dispatchMessageAction(message);

        await wait(300);
        message.setDecryptedBody(msg.getDecryptedBody(), false);

        const promise = validateMessage
            .validate(message)
            .then(eventManager.stop)
            .then(() => extractDataURI(message))
            .then(() => attachPublicKey.attach(message))
            .then(() => postMessage(message))
            .then((messageSaved) => ((message.ID = messageSaved.ID), message))
            .then((msg) => sendMessage(msg))
            .then(eventManager.start)
            .catch((e) =>
                attachPublicKey.remove(message).then(() => {
                    setStateSending(false);
                    message.encrypting = false;
                    dispatchMessageAction(message);
                    eventManager.start();
                    throw e;
                })
            );
        networkActivityTracker.track(promise);
    };

    /**
     * Focus the first not minimized composer window
     * @param {Object} message
     */
    $scope.focusFirstComposer = (message) => {
        dispatcher['composer.update']('focus.first', { message });
    };

    $scope.minimize = (message) => {
        message.minimized = true;
        message.previousMaximized = message.maximized;
        message.maximized = false;
        message.ccbcc = false;
        AppModel.set('maximizedComposer', false);
        // Hide all the tooltip
        $('.tooltip')
            .not(this)
            .hide();
        $scope.focusFirstComposer(message);
    };

    $scope.unminimize = (message) => {
        message.minimized = false;
        message.maximized = message.previousMaximized;
        // Hide all the tooltip
        $('.tooltip')
            .not(this)
            .hide();
    };

    $scope.maximize = (message) => {
        message.maximized = true;
        AppModel.set('maximizedComposer', true);
    };

    $scope.normalize = (message) => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isSmall = width <= 640 || height <= 500;

        message.minimized = false;
        message.maximized = isSmall;
        AppModel.set('maximizedComposer', isSmall);
    };

    $scope.openCloseModal = (message, discard = false) => {
        $scope.close(message, discard, !discard);
    };

    /**
     * Remove a message from the list of messages
     * @param  {Array} list    List of messages
     * @param  {Ressource} message Message to remove
     * @return {Array}
     */
    function removeMessage(list, message) {
        return list.filter((item) => message.ID !== item.ID);
    }

    /**
     * Close the composer window
     * @param {Object} message
     * @param {Boolean} discard
     * @param {Boolean} save
     */
    $scope.close = closeComposer;
    function closeComposer(msg, discard, save) {
        const message = messageModel(msg);

        const process = () => {
            // Remove message in composer controller
            $scope.messages = removeMessage($scope.messages, message);
            composerRequestModel.clear(message);
            outsidersMap.remove(message.ID);
            commitComposer(message, true);

            // Hide all the tooltip
            $('.tooltip')
                .not(this)
                .hide();

            dispatcher['composer.update']('close', {
                size: $scope.messages.length,
                message
            });
        };

        if (discard === true) {
            const ids = [message.ID];

            dispatcher.messageActions('delete', { ids });
        }

        $timeout.cancel(message.defferredSaveLater);

        if (save === true) {
            postMessage(message, { autosaving: true }).then(process);
        } else {
            process();
        }
    }

    /**
     * Move draft message to trash
     * @param {Object} message
     * @return {Promise}
     */
    $scope.discard = (message) => {
        const title = gettextCatalog.getString('Delete', null);
        const question = gettextCatalog.getString('Permanently delete this draft?', null);

        /**
         * When the confirm modal is opened, a draft can still be saved.
         * That can cause race conditions when the user wants to delete the message.
         * Set a variable on the message to prevent the auto saving from happening when this modal is opened.
         */
        message.discardDontAutoSave = true;

        confirmModal.activate({
            params: {
                title,
                message: question,
                confirm() {
                    $scope.openCloseModal(message, true);
                    // Delete it after the close message has run to be sure the save is not triggered.
                    delete message.discardDontAutoSave;
                    notification.success(gettextCatalog.getString('Message discarded', null));
                    confirmModal.deactivate();
                },
                cancel() {
                    delete message.discardDontAutoSave;
                    confirmModal.deactivate();
                }
            }
        });
    };
}
export default ComposeMessageController;
