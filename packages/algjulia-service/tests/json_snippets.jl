fragment =
"""
{
  \"name\": \"Exterior calculus in 2D\",
  \"notebook\": {
    \"cells\": [
      {
        \"content\": {
          \"id\": \"019323fa-49cb-7373-8c5d-c395bae4006d\",
          \"name\": \"0-form\",
          \"obType\": {
            \"content\": \"Object\",
            \"tag\": \"Basic\"
          },
          \"tag\": \"object\"
        },
        \"id\": \"019323fa-49cb-7373-8c5d-c3960dc5fe3f\",
        \"tag\": \"formal\"
      },
      {
        \"content\": {
          \"id\": \"019323fa-783b-72c8-af20-c0718fde3ac8\",
          \"name\": \"1-form\",
          \"obType\": {
            \"content\": \"Object\",
            \"tag\": \"Basic\"
          },
          \"tag\": \"object\"
        },
        \"id\": \"019323fa-783b-72c8-af20-c0723b419842\",
        \"tag\": \"formal\"
      },
      {
        \"content\": {
          \"id\": \"019323fb-175b-784e-aab8-7b78fa576571\",
          \"name\": \"2-form\",
          \"obType\": {
            \"content\": \"Object\",
            \"tag\": \"Basic\"
          },
          \"tag\": \"object\"
        },
        \"id\": \"019323fb-175c-70dc-a8e7-65cdeb5b0ab9\",
        \"tag\": \"formal\"
      },
      {
        \"content\": {
          \"cod\": {
            \"content\": \"019323fa-49cb-7373-8c5d-c395bae4006d\",
            \"tag\": \"Basic\"
          },
          \"dom\": {
            \"content\": \"019323fa-49cb-7373-8c5d-c395bae4006d\",
            \"tag\": \"Basic\"
          },
          \"id\": \"019323fb-3652-7e91-aee9-06187a954fc6\",
          \"morType\": {
            \"content\": {
              \"content\": \"Object\",
              \"tag\": \"Basic\"
            },
            \"tag\": \"Hom\"
          },
          \"name\": \"∂t\",
          \"tag\": \"morphism\"
        },
        \"id\": \"019323fb-3652-7e91-aee9-061903ec55be\",
        \"tag\": \"formal\"
      },
      {
        \"content\": {
          \"cod\": {
            \"content\": \"019323fa-49cb-7373-8c5d-c395bae4006d\",
            \"tag\": \"Basic\"
          },
          \"dom\": {
            \"content\": \"019323fa-49cb-7373-8c5d-c395bae4006d\",
            \"tag\": \"Basic\"
          },
          \"id\": \"019323ff-1af6-79da-b776-8ee11c88a8a0\",
          \"morType\": {
            \"content\": {
              \"content\": \"Object\",
              \"tag\": \"Basic\"
            },
            \"tag\": \"Hom\"
          },
          \"name\": \"Δ\",
          \"tag\": \"morphism\"
        },
        \"id\": \"019323ff-1af7-77f4-9eec-cca3b5b1bf76\",
        \"tag\": \"formal\"
      }
    ]
  },
  \"theory\": \"diagrammatic-equations\",
  \"type\": \"model\"
}
"""

pode =
"""
{
  \"modelRef\": {
    \"refId\": \"019323f9-229b-7523-ac5f-89596a3c9b7c\",
    \"tag\": \"extern-ref\",
    \"taxon\": \"model\"
  },
  \"name\": \"\",
  \"notebook\": {
    \"cells\": [
      {
        \"content\": {
          \"id\": \"01932402-bcf5-7432-8d14-dbae9eabf907\",
          \"name\": \"C\",
          \"obType\": {
            \"content\": \"Object\",
            \"tag\": \"Basic\"
          },
          \"over\": {
            \"content\": \"019323fa-49cb-7373-8c5d-c395bae4006d\",
            \"tag\": \"Basic\"
          },
          \"tag\": \"object\"
        },
        \"id\": \"01932402-bcf5-7432-8d14-dbafdbd0a47f\",
        \"tag\": \"formal\"
      },
      {
        \"content\": {
          \"id\": \"01932403-5b6c-7231-90d7-d7cece275eb2\",
          \"name\": \"dC/dt\",
          \"obType\": {
            \"content\": \"Object\",
            \"tag\": \"Basic\"
          },
          \"over\": {
            \"content\": \"019323fa-49cb-7373-8c5d-c395bae4006d\",
            \"tag\": \"Basic\"
          },
          \"tag\": \"object\"
        },
        \"id\": \"01932403-5b6c-7231-90d7-d7cf3e324af6\",
        \"tag\": \"formal\"
      },
      {
        \"content\": {
          \"cod\": {
            \"content\": \"01932403-5b6c-7231-90d7-d7cece275eb2\",
            \"tag\": \"Basic\"
          },
          \"dom\": {
            \"content\": \"01932402-bcf5-7432-8d14-dbae9eabf907\",
            \"tag\": \"Basic\"
          },
          \"id\": \"01932403-c4cd-7563-8ebd-080dd37a9c7e\",
          \"morType\": {
            \"content\": {
              \"content\": \"Object\",
              \"tag\": \"Basic\"
            },
            \"tag\": \"Hom\"
          },
          \"name\": \"\",
          \"over\": {
            \"content\": \"019323fb-3652-7e91-aee9-06187a954fc6\",
            \"tag\": \"Basic\"
          },
          \"tag\": \"morphism\"
        },
        \"id\": \"01932403-c4ce-7ffc-8264-5feb9ea6648c\",
        \"tag\": \"formal\"
      },
      {
        \"content\": {
          \"cod\": {
            \"content\": \"01932403-5b6c-7231-90d7-d7cece275eb2\",
            \"tag\": \"Basic\"
          },
          \"dom\": {
            \"content\": \"01932402-bcf5-7432-8d14-dbae9eabf907\",
            \"tag\": \"Basic\"
          },
          \"id\": \"01932404-10e5-7128-bb94-835e5d8d643f\",
          \"morType\": {
            \"content\": {
              \"content\": \"Object\",
              \"tag\": \"Basic\"
            },
            \"tag\": \"Hom\"
          },
          \"name\": \"\",
          \"over\": {
            \"content\": \"019323ff-1af6-79da-b776-8ee11c88a8a0\",
            \"tag\": \"Basic\"
          },
          \"tag\": \"morphism\"
        },
        \"id\": \"01932404-10e6-7797-9250-4d484f0e05fd\",
        \"tag\": \"formal\"
      }
    ]
  },
  \"type\": \"diagram\"
}
"""
