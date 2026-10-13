const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt, markDeleted } = require("./hooks");


class ProductCategoryMapping extends Model {}
ProductCategoryMapping.init(
	{
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
        product_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        product_category_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
		is_active: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
		},
		created_at: {
			type: DataTypes.DATE,
			defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
		},
		updated_at: {
			type: DataTypes.DATE,
			defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
			onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
		},
		deleted_at: {
			type: DataTypes.DATE,
			allowNull: true,
		},
	},
	{
		sequelize,
		tableName: "product_category_mapping",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

ProductCategoryMapping.beforeUpdate(touchUpdatedAt);
ProductCategoryMapping.beforeDestroy(markDeleted);

module.exports = ProductCategoryMapping;
