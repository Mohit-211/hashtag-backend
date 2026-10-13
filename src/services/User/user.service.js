const httpStatus = require('http-status');

const { User, UserAttachment, Profile } = require('../../models');
const ApiError = require('../../utils/ApiError');


const getProfile = async (body, headers) => {

    try {
        const { user } = body;
        const { role_id } = headers;
        let result = '';

        result = await User.findOne({
            attributes: ['id', 'user_name', 'email', 'role_id', 'square_customer_id', 'status', 'notification_status'],
            include: [
                {
                    model: Profile,
                    as: 'user_profile',
                    attributes: ['name', 'dialing_code', 'mobile', 'is_active', 'created_at'],
                },
                {
                    model: UserAttachment,
                    as: 'user_attachments',
                    attributes: ['id', 'title', 'file_type', 'file_name', 'file_uri', 'role_id'],
                    order: [['id', 'desc']],
                    limit: 1,
                }
            ],
            where: { id: user?.id, is_active: true, role_id: role_id }
        });
        if (!result) throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to Get Profile.');
        return result;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const deactivateAccount = async (reqBody) => {

    try {
        const { user } = reqBody;
        const isDeactivated = await user.destroy();

        if (!isDeactivated) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to Deactive your account.');
        };
        return '';

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const notificationToogle = async (body) => {

    try {
        const { user } = body;
        user.notification_status = !user.notification_status;
        await user.save();
        return user;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

module.exports = {
    getProfile,
    deactivateAccount,
    notificationToogle,
};
