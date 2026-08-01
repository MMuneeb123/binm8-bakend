export default (sequelize, DataTypes) => {
    return sequelize.define("Council", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Full name of the council (e.g., "Barnsley Borough Council")'
        },
        type: {
            type: DataTypes.ENUM(
                'Metropolitan District',
                'London Borough',
                'Unitary Authority',
                'County Council',
                'District Council',
                'Special'
            ),
            allowNull: false,
            comment: 'Type of council - Special includes City of London and Isles of Scilly'
        },
        country: {
            type: DataTypes.STRING(7),
            allowNull: false,
            defaultValue: 'GB-ENG',
            references: {
                model: 'Countries',
                key: 'code'
            },
            comment: 'Country code - GB-ENG for England'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: 'Whether this council is available for selection'
        }
    }, {
        indexes: [
            {
                fields: ['type']
            },
            {
                fields: ['country']
            },
            {
                fields: ['isActive']
            }
        ]
    });
};

